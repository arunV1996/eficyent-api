<?php

namespace App\Repositories;

use App\Exports\BulkTemplateExport;
use App\Factories\AccountValidation\AccountValidationFactory;
use App\Factories\Beneficiary\BeneficiaryFactory;
use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\BeneficiaryAccount;
use App\Models\BeneficiaryAccountValidation;
use App\Models\BeneficiaryAdditionalDetail;
use App\Services\ImportService\ExcelImportService;
use App\Services\Surepass\ValidationService;
use App\Validators\BeneficiaryValidator;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Illuminate\Contracts\Cache\LockProvider;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;
use Illuminate\Support\Facades\Log;

class BeneficiaryAccountRepository
{

    public function list(Request $request, $user, $team_member = null)
    {

        $status = null;
        
        if($request->filled('status')){

            $status = beneficiary_account_status_map()[$request->status] ?? null;
        }

        $type = null;

        if ($request->filled('type')) {

            $type = user_type_map()[$request->type] ?? null;
        }

        $baseQuery = BeneficiaryAccount::where('user_id', $user->id)
            ->when(!is_null($type), function ($query) use ($type) {
                $query->where('type', $type);
            })
            ->when($request->filled('payment_rail'), function ($query) use ($request) {
                $query->where('payment_rail', $request->payment_rail);
            })
            ->when(!is_null($status), function ($query) use ($status) {
                $query->where('status', $status);
            })
            ->when($request->filled('recipient_country'), function ($query) use ($request) {
                $query->where('country', $request->recipient_country);
            })
            ->when($request->filled('recipient_currency'), function ($query) use ($request) {
                $query->where('currency', $request->recipient_currency);
            })
            ->when($request->filled('search_key'), function ($query) use ($request) {

                $key = '%' . $request->search_key . '%';

                $query->where(function ($q) use ($key) {
                    $q->where('email', 'like', $key)
                        ->orWhere('unique_id', 'like', $key)
                        ->orWhere('first_name', 'like', $key)
                        ->orWhere('last_name', 'like', $key)
                        ->orWhere('mobile', 'like', $key)
                        ->orWhere('account_number', 'like', $key)
                        ->orWhere('account_name', 'like', $key)
                        ->orWhere('bank_name', 'like', $key)
                        ->orWhere('routing_number', 'like', $key)
                        ->orWhere('swift_code', 'like', $key)
                        ->orWhere('business_name', 'like', $key);
                });
            });

            if($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

                $baseQuery = $baseQuery->where('team_member_id', $team_member->id);
            }

        $baseQuery = $baseQuery->orderBy('created_at', 'desc');

        list($skip, $take) = [
            $request->skip ?? 0,
            $request->take ?? TAKE_COUNT
        ];

        return [
            'total' => $baseQuery->count(),
            'beneficiary_accounts' => $baseQuery->skip($skip)->take($take)->get(),
        ];
    }

    public function check_already_exist(array $validated, $user)
    {

        $accountNumber = $validated['beneficiaryAccount']['account_number'] ?? null;

        if (empty($accountNumber)) {
            return null;
        }
        $already_exists = BeneficiaryAccount::where('user_id', $user->id)
            ->where('account_number', $validated['beneficiaryAccount']['account_number'])
            ->where('currency', $validated['beneficiaryAccount']['currency'])
            ->first();

        return $already_exists;
    }

    public function create(array $validated, $user)
    {

        DB::beginTransaction();

        if($validated['beneficiaryAccount']['country'] == "USA" && $validated['beneficiaryAccount']['currency'] == "USD") {

            if($validated['beneficiaryAccount']['swift_code'] != "") {

                $validated['beneficiaryAccount']['payment_rail'] = PAYMENT_RAIL_SWIFT;

                $beneficiary_account = $this->create_beneficiary($validated, $user);

            }else{

                $rails = [PAYMENT_RAIL_ACH,PAYMENT_RAIL_WIRE];

                foreach ($rails as $rail) {

                    $validated['beneficiaryAccount']['payment_rail'] = $rail;

                   $beneficiary_account = $this->create_beneficiary($validated, $user);
                }
            }
        }else{

            $beneficiary_account = $this->create_beneficiary($validated, $user);
        }

        DB::commit();

        return $beneficiary_account;

    }

    public function create_beneficiary(array $validated, $user)
    {

        $beneficiary_account = BeneficiaryAccount::create($validated['beneficiaryAccount']);

        throw_if(!$beneficiary_account, new Exception(api_error(117), 117));

        $validated['beneficiaryAccountAdditionalDetail']['beneficiary_account_id'] = $beneficiary_account->id;

        $beneficiary_additional_detail = BeneficiaryAdditionalDetail::create($validated['beneficiaryAccountAdditionalDetail']);

        throw_if(!$beneficiary_additional_detail, new Exception(api_error(117), 117));

        $beneficiary_account->refresh();

        // $externalService = getExternalType($beneficiary_account->country, $beneficiary_account->currency, $user);

        $types = array_intersect(getExternalTypes($beneficiary_account->country, $beneficiary_account->currency, $user), [EXTERNAL_TYPE_CALIZA, EXTERNAL_TYPE_FVBANK]);

        // if($types) {

        //     foreach($types as $type) {

        //         BeneficiaryFactory::resolve($type)->create($beneficiary_account, $user);
        //     }

        // } else {

            $beneficiary_account->update(['status' => BENEFICIARY_ACCOUNT_ACTIVATED]);
        // }

        return $beneficiary_account->refresh();
    }

    public function show($user, $beneficiary_account_id)
    {
        return BeneficiaryAccount::where('user_id', $user->id)->where('unique_id', $beneficiary_account_id)->first();
    }

    public function delete($user, $beneficiary_account_id)
    {
        $beneficiary_account = BeneficiaryAccount::where('user_id', $user->id)->where('unique_id', $beneficiary_account_id)->first();

        throw_if(!$beneficiary_account, new Exception(api_error(118), 118));

        $beneficiary_account->delete();
    }

    public function template($user, $validated)
    {
        $beneficiary_form =  FieldsHelper::beneficiary_form_fields($validated, $user) ?? [];

        $form = [
            'beneficiary' => $beneficiary_form,
        ];

        $fields = Helper::flattenFormFields($form);

        $fields = collect($fields)
            ->sortBy(fn($f) => match ($f['section']) {
                'beneficiary' => 1,
            })
            ->values()
            ->all();

        $fileName = 'beneficiary_template_' . now()->timestamp . '.xlsx';

        $filePath = 'beneficiary/' . $fileName;

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

        $beneficiary_form = FieldsHelper::beneficiary_form_fields($validated, $user) ?? [];

        $form = [
            'beneficiary' => $beneficiary_form,
        ];

        $fields = Helper::flattenFormFields($form);

        $result = ExcelImportService::process(
            $file,
            $fields,
            function ($payload, $rowNumber) use ($validated, $user) {

                $payload['beneficiary']['country']  = $validated['country'];
                $payload['beneficiary']['currency'] = $validated['currency'];

                return [
                    'row' => $rowNumber,
                    'beneficiary' => BeneficiaryValidator::validate($payload['beneficiary'], $user),
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

                $beneficiary = $this->create($rowData['beneficiary'], $user);

                $created[] = [
                    'row'            => $rowData['row'],
                    'beneficiary_id' => $beneficiary->unique_id,
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

    public function validate_account($user, $validated)
    {
        $key = "account_validation_lock:{$validated['account_number']}:{$validated['ifsc']}";

        $cache = Cache::store('redis');

        // return $cache->lock($key, 60)
        //     ->block(10, function () use ($user, $validated) { 

                $check_exists = BeneficiaryAccountValidation::where('account_number', $validated['account_number'])
                    ->where('code', $validated['ifsc'])
                    ->first();

                if ($check_exists) {
                    return $check_exists;
                }

                $payload = [
                    'merchant_email' => $user->merchant ? $user->merchant->email : $user->email,
                    'merchant_name'  => $user->merchant ? $user->merchant->name : $user->name,
                    'account_number' => $validated['account_number'],   
                    'ifsc_code'           => $validated['ifsc'],
                ];

                Log::info("Account validation request", [
                    'payload' => $payload,
                ]);

                $validation_service = app(ProcessingUnit::class)->validateAccount($payload);

                Log::info("Account validation response", [
                    'payload' => $payload,
                    'response' => $validation_service,
                ]);

                return $this->createBeneficiaryAccountValidation($user, $validation_service['data'] ?? [], $payload);
            // });
    }

    private function createBeneficiaryAccountValidation($user, $response, $payload)
    {
        $checkExists = BeneficiaryAccountValidation::where('account_number', $response['account_number'])->first();

        if($checkExists) {

            return $checkExists;
        }
        $beneficiaryAccount = DB::transaction(function () use ($user, $response, $payload) {

            $status = BENEFICIARY_ACCOUNT_VALIDATION_STATUS_SUCCESS;
            
            $beneficiaryAccount = BeneficiaryAccountValidation::create([
                'user_id' => $user->id,
                'account_name' => $response['account_name'] ?? '',
                'account_number' => $response['account_number'] ?? '',
                'code' => $response['ifsc_code'],
                'validation_service' => EXTERNAL_TYPE_PROCESSING_UNIT,
                'external_reference_id' => $response['client_id'] ?? '',
                'external_status' => $response['status'] ?? '',
                'external_data' => $response,
                'remarks' => isset($data['remarks']) && $data['remarks'] != "" ? $data['remarks'] : $response['message'] ?? '',
                'is_account_exists' => strtoupper($response['is_account_exists'] ?? 'NO') === 'YES' ? 1 : 0,
                'is_nre_account' => strtoupper($response['is_nre_account'] ?? 'NO') === 'YES' ? 1 : 0,
                'status' => $status
            ]);

            throw_if(!$beneficiaryAccount, new Exception(api_error(179), 179));

            return $beneficiaryAccount;
        });

        return $beneficiaryAccount;
    }
}
