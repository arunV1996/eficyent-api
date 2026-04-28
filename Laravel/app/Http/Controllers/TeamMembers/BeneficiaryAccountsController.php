<?php

namespace App\Http\Controllers\TeamMembers;

use App\Helpers\FieldsHelper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Beneficiary\BeneficiaryFormFieldsRequest;
use App\Http\Requests\Beneficiary\BeneficiaryShowRequest;
use App\Http\Requests\Beneficiary\BeneficiaryStoreRequest;
use App\Http\Requests\BeneficiaryTransactions\BulkPayoutStoreRequest;
use App\Http\Requests\BeneficiaryTransactions\GetFormFieldsRequest;
use App\Http\Resources\BeneficiaryAccountResource;
use App\Models\BeneficiaryAccount;
use App\Repositories\BeneficiaryAccountRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BeneficiaryAccountsController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new BeneficiaryAccountRepository();
    }
    public function index(Request $request)
    {
        try {

            $user = auth('team')->user();

            $beneficiary_accounts = $this->repository->list($request, $user->user, $user);

            $data['total'] = $beneficiary_accounts['total'];

            $data['beneficiary_accounts'] = BeneficiaryAccountResource::collection($beneficiary_accounts['beneficiary_accounts']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns an array of form fields for the given beneficiary type and network type.
     * 
     * @param BeneficiaryFormFieldsRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function get_form_fields(BeneficiaryFormFieldsRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            $data['form_fields'] = FieldsHelper::beneficiary_form_fields($validated, $user->user) ?? [];

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Creates a new beneficiary account.
     * 
     * @param BeneficiaryStoreRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function store(BeneficiaryStoreRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            $repository = new BeneficiaryAccountRepository();

            $already_exists = BeneficiaryAccount::where('user_id', $user->user->id)
                ->where('account_number', $validated['beneficiaryAccount']['account_number'])
                ->first();

            throw_if($already_exists, new Exception(api_error(158), 158));

            $beneficiary_account = $repository->create($validated, $user->user);

            $data['beneficiary_account'] = new BeneficiaryAccountResource($beneficiary_account);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            DB::rollBack();

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show(BeneficiaryShowRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            $beneficiary_account = $this->repository->show($user->user, $validated['beneficiary_account_id']);

            throw_if(!$beneficiary_account, new Exception(api_error(118), 118));

            $data['beneficiary_account'] = new BeneficiaryAccountResource($beneficiary_account);

            return $this->sendResponse(tr('beneficiary_fetch_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function delete(BeneficiaryShowRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            $this->repository->delete($user->user, $validated['beneficiary_account_id']);

            return $this->sendResponse(tr('beneficiary_delete_success'), '', []);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function template(BeneficiaryFormFieldsRequest $request)
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

    public function bulk_store(BulkPayoutStoreRequest $request)
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
