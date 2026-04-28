<?php

namespace App\Http\Controllers\TeamMembers;

use App\Helpers\FieldsHelper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Senders\SenderBulkImportRequest;
use App\Http\Requests\Senders\SendersFormFieldsRequest;
use App\Http\Requests\Senders\SendersShowRequest;
use App\Http\Requests\Senders\SendersStoreRequest;
use App\Http\Requests\Senders\SendersUpdateRequest;
use App\Http\Resources\SenderResource;
use App\Models\Sender;
use App\Repositories\SenderRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SenderController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new SenderRepository();
    }
    /**
     * Returns an array of form fields for the given sender type.
     *
     * @param  SendersFormFieldsRequest  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function get_form_fields(SendersFormFieldsRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = auth('team')->user()->user;

            $data['form_fields'] = FieldsHelper::sender_fields($validated['type'], $user) ?? [];

            if (isset($validated['sender_id']) && !empty($validated['sender_id'])) {

                $sender = Sender::where('user_id', $user->id)->where('unique_id', $validated['sender_id'])->first();

                throw_if(!$sender, new Exception(api_error(143), 143));

                foreach ($data['form_fields'] as $key => $field) {

                    $data['form_fields'][$key]['field_value'] = $sender->{$field['field_key']} ?? null;

                    if ($field['field_key'] == 'business_name') {

                        $data['form_fields'][$key]['field_value'] = $sender->first_name ?? '';
                    }
                }
            }
            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of senders associated with the given user.
     * 
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function index(Request $request)
    {
        try {

            $user = auth('team')->user();

            $senders = $this->repository->list($request, $user->user, $user);

            $data['total'] = $senders['total'];

            $data['remitters'] = SenderResource::collection($senders['senders']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Stores a new sender
     *
     * @param SendersStoreRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function store(SendersStoreRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $repository = new SenderRepository();

            $sender = $repository->create($validated, $user);

            $data['remitter'] = new SenderResource($sender);

            return $this->sendResponse(tr('sender_create_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Updates the given sender.
     *
     * @param SendersUpdateRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function update(SendersUpdateRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $sender = Sender::where('user_id', $user->id)->where('unique_id', $validated['sender_id'])->first();

            throw_if(!$sender, new Exception(api_error(132), 132));

            DB::transaction(function () use ($validated, $sender) {

                throw_if(!$sender->update($validated), new Exception(api_error(134), 134));
            });

            $data['remitter'] = new SenderResource($sender->refresh());

            return $this->sendResponse(tr('sender_update_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given sender.
     *
     * @param SendersShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(SendersShowRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated  = $request->validated();

            $sender = $this->repository->show($user, $validated);

            throw_if(!$sender, new Exception(api_error(132), 132));

            $data['remitter'] = new SenderResource($sender);
            
            return $this->sendResponse(tr('sender_fetch_success'), 132, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Deletes the given sender.
     *
     * @param SendersShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function delete(SendersShowRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated  = $request->validated();

            $this->repository->delete($user, $validated['remitter_id']);

            return $this->sendResponse(tr('sender_delete_success'), 133);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function template(SendersFormFieldsRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            $url = $this->repository->template($user->user, $validated);

            return $this->sendResponse(tr('template_export_success'), '', ['url' => $url]);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function bulk_store(SenderBulkImportRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $file = $request->file('file');

            $response = $this->repository->bulk_store($user->user, $validated, $file);

            $data['errors'] = $response['failed'];

            if(!empty($response['failed'])) {

                return $this->sendResponse(tr('bulk_import_failed'),'', $data);
            }

            $data['success'] = $response['created'];

            return $this->sendResponse(tr('bulk_import_success'), '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
