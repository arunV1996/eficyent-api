<?php

namespace App\Repositories;

use App\Exports\BulkTemplateExport;
use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\Sender;
use App\Models\SenderDocument;
use App\Services\ImportService\ExcelImportService;
use App\Validators\SenderValidator;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;

class SenderRepository
{
    public function list(Request $request, $user, $team_member = null)
    {
        $status = null;

        if($request->filled('status')){

            $status = remitter_status_map()[$request->status] ?? null;
        }

        $type = null;

        if($request->filled('type')){

            $type = user_type_map()[$request->type] ?? null;
        }

        $baseQuery = Sender::where('user_id', $user->id)
            ->when($request->filled('search_key'), function ($query) use ($request) {

                $key = '%' . $request->search_key . '%';

                $query->where(function ($q) use ($key) {
                    $q->where('email', 'like', $key)
                        ->orWhere('unique_id', 'like', $key)
                        ->orWhere('first_name', 'like', $key)
                        ->orWhere('last_name', 'like', $key)
                        ->orWhere('middle_name', 'like', $key)
                        ->orWhere('mobile', 'like', $key)
                        ->orWhere('id_number', 'like', $key);
                });
            })
            ->when(!is_null($type), function ($query) use ($type) {
                $query->where('type', $type);
            })
            ->when(!is_null($status), function ($query) use ($status) {
                $query->where('status', $status);
            });

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $baseQuery = $baseQuery->where('team_member_id', $team_member->id);
        }

        $baseQuery->orderBy('created_at', 'desc');
        
        list($skip, $take) = [$request->skip ?? 0, $request->take ?? TAKE_COUNT];

        return [
            'total' => $baseQuery->count(),
            'senders' => $baseQuery->skip($skip)->take($take)->get(),
        ];
    }
    public function create(array $validated, $user)
    {
        $validated['user_id'] = $user->id;

        $validated['status'] = SENDER_STATUS_PENDING;

        $sender = DB::transaction(function () use ($validated, $user) {

            $validated['user_id'] = $user->id;

            $validated['status'] = SENDER_STATUS_PENDING;

            $id_exists = Sender::where('user_id', $user->id)->where('id_number', $validated['id_number'])->exists();

            throw_if($id_exists, new Exception(api_error(130), 130));

            if ($validated['type'] == USER_TYPE_INDIVIDUAL) {

                $validated['status'] = SENDER_STATUS_APPROVED;
            }

            $sender = Sender::create($validated);

            throw_if(!$sender, new Exception(api_error(131), 131));

            if ($sender->type == USER_TYPE_BUSINESS) {

                $proofs = $validated['proofs'] ?? [];

                if (!empty($proofs)) {

                    $fileName = null;

                    $documentFile = $proofs['document_file'] ?? null;

                    if ($documentFile instanceof \Illuminate\Http\UploadedFile) {

                        $fileName = Helper::uploadToS3($documentFile, USER_DOCUMENT_FILE_PATH);

                        throw_if(!$fileName, new Exception(api_error(109), 109));
                    } else if (is_string($documentFile) && Helper::isBase64File($documentFile)) {

                        $fileName = Helper::uploadBase64ToS3($documentFile, USER_DOCUMENT_FILE_PATH);

                        throw_if(!$fileName, new Exception(api_error(109), 109));
                    }

                    SenderDocument::updateOrCreate(
                        [
                            'sender_id' => $sender->id,

                        ],
                        [
                            'document_file' => $fileName,
                            'document_name' => "Proofs",
                            'document_type' => $proofs['document_type'] ?? null,
                            'document_country' => $proofs['document_country'] ?? null,
                        ]
                    );
                }
            }

            return $sender->refresh();
        });

        return $sender;
    }

    public function show($user, $validated)
    {

        $sender = null;

        if(isset($validated['remitter_id'])) {

            $sender = Sender::where('user_id', $user->id)->where('unique_id', $validated['remitter_id'])->first();

        }elseif(isset($validated['id_number'])) {
            
            $sender = Sender::where('user_id', $user->id)->where('id_number', $validated['id_number'])->first();
        }elseif(isset($validated['email'])) {
            
            $sender = Sender::where('user_id', $user->id)->where('email', $validated['email'])->first();
        }

        throw_if(!$sender, new Exception(api_error(132), 132));

        return $sender;
    }

    public function delete($user, $sender_id)
    {
        $sender = Sender::where('user_id', $user->id)->where('unique_id', $sender_id)->first();

        throw_if(!$sender, new Exception(api_error(132), 132));

        $sender->delete();
    }

    public function template($user, $validated)
    {
     
        $sender_form = FieldsHelper::sender_fields($validated['type']) ?? [];

        $form = [
            'remitter' => $sender_form
        ];

        $fields = Helper::flattenFormFields($form);

        $fields = collect($fields)
            ->sortBy(fn($f) => match ($f['section']) {
                'remitter' => 1,
            })
            ->values()
            ->all();

        $fileName = 'sender_template_' . now()->timestamp . '.xlsx';

        $filePath = 'sender/' . $fileName;

        Excel::store(
            new BulkTemplateExport($fields),
            $filePath,
            'public'
        );

        $url = Storage::disk('public')->url($filePath);

        return $url;
    }

    public function bulk_store($user, $validated, $file)
    {

        $sender_form = FieldsHelper::sender_fields($validated['type'], $user) ?? [];

        $form = [
            'remitter' => $sender_form,
        ];

        $fields = Helper::flattenFormFields($form);

        $result = ExcelImportService::process(
            $file,
            $fields,
            function ($payload, $rowNumber) use ($validated, $user) {

                return [
                    'row' => $rowNumber,
                    'remitter' => SenderValidator::validate($payload['remitter']),
                ];
            }
        );
        if (!empty($result['errors'])) {

            return [
                'created' => [],
                'failed'  => $result['errors'],
            ];
        }

        return $this->bulkCreate($result['validatedRows'], $user);
    }

    public function bulkCreate(array $validatedRows, $user): array
    {
        $created = [];

        $failed  = [];

        foreach ($validatedRows as $rowData) {

            try {

                $remitter = $this->create($rowData['remitter'], $user);

                $created[] = [
                    'row'            => $rowData['row'],
                    'remitter_id' => $remitter->unique_id,
                ];
            } catch (Exception $e) {

                $failed[] = [
                    'row'     => $rowData['row'],
                    'errors' => [
                        [
                            'field'   => null,
                            'message' => $e->getMessage(),
                        ],
                    ],
                ];
            }
        }

        return compact('created', 'failed');
    }
}
