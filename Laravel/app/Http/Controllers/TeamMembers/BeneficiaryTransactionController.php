<?php

namespace App\Http\Controllers\TeamMembers;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\BeneficiaryTransactions\BeneficiaryTransactionCancelRequest;
use App\Http\Requests\BeneficiaryTransactions\BeneficiaryTransactionShowRequest;
use App\Http\Requests\BeneficiaryTransactions\BeneficiaryTransactionStoreRequest;
use App\Http\Requests\BeneficiaryTransactions\BeneficiaryTransactionUpdateRequest;
use App\Http\Requests\BeneficiaryTransactions\BulkPayoutStoreRequest;
use App\Http\Requests\BeneficiaryTransactions\GetFormFieldsRequest;
use App\Http\Requests\BeneficiaryTransactions\SendMoneyDirectRequest;
use App\Http\Requests\BeneficiaryTransactions\TransactionProofGetRequest;
use App\Http\Requests\BeneficiaryTransactions\TransactionProofRequest;
use App\Http\Resources\BeneficiaryTransactionResource;
use App\Http\Resources\TransactionProofResource;
use App\Models\BeneficiaryAccount;
use App\Models\BeneficiaryTransaction;
use App\Models\Sender;
use App\Repositories\BeneficiaryAccountRepository;
use App\Repositories\BeneficiaryTransactionRepository;
use App\Repositories\SenderRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BeneficiaryTransactionController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new BeneficiaryTransactionRepository();
    }

    public function index(Request $request)
    {

        try {

            $user = auth('team')->user();

            $beneficiary_transactions = $this->repository->list($request, $user->user, false, $user);

            $data['total'] = $beneficiary_transactions['total'];

            $data['beneficiary_transactions'] = BeneficiaryTransactionResource::collection($beneficiary_transactions['beneficiary_transactions']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Creates a new beneficiary transaction.
     *
     * @param BeneficiaryTransactionStoreRequest $request
     * @param BeneficiaryTransactionFactory $beneficiary_transaction_factory
     * @return JsonResponse
     * @throws Exception
     */
    public function store(BeneficiaryTransactionStoreRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = auth('team')->user()->user;

            $transaction_service = new BeneficiaryTransactionRepository();

            $beneficiary_transaction = $transaction_service->create($validated, $user , auth('team')->user());

            $data['beneficiary_transaction'] = new BeneficiaryTransactionResource($beneficiary_transaction);

            return $this->sendResponse(api_success(108), 108, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given beneficiary transaction.
     * 
     * @param BeneficiaryTransactionShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(BeneficiaryTransactionShowRequest $request)
    {

        try {

            $user = auth('team')->user()->user;

            $validated  = $request->validated();

            $beneficiary_transaction = $this->repository->show($user, $validated['beneficiary_transaction_id']);

            throw_if(!$beneficiary_transaction, new Exception(api_error(124), 124));

            $data['beneficiary_transaction'] = new BeneficiaryTransactionResource($beneficiary_transaction);

            return $this->sendResponse(tr('transaction_fetch_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }


    /**
     * Checks the status of the given beneficiary transaction.
     * 
     * @param BeneficiaryTransactionShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function check_transaction_status(BeneficiaryTransactionShowRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated  = $request->validated();

            $beneficiary_transaction = $this->repository->checkStatus($user, $validated);

            throw_if(!$beneficiary_transaction, new Exception(api_error(124), 124));

            $data['beneficiary_transaction'] = new BeneficiaryTransactionResource($beneficiary_transaction);

            return $this->sendResponse(tr('transaction_fetch_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Exports the given beneficiary transaction as a PDF.
     *
     * @param BeneficiaryTransactionShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function export(BeneficiaryTransactionShowRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated  = $request->validated();

            $data['url'] = $this->repository->downloadReceipt($user, $validated);

            return $this->sendResponse(tr('transaction_export_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function update_status(BeneficiaryTransactionUpdateRequest $request)
    {
        try {

            $team_member = auth('team')->user();

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $transaction_ids = $validated['beneficiary_transaction_ids'];

            $beneficiary_transactions = BeneficiaryTransaction::whereIn('unique_id', $transaction_ids)
                                        ->where('user_id', $user->id)
                                        ->lockForUpdate()
                                        ->get();

            throw_if($beneficiary_transactions->count() !== count($transaction_ids), new Exception(api_error(170), 170));

            $data = $this->repository->updateStatus($beneficiary_transactions, $validated, $team_member);

            return $this->sendResponse(tr('transaction_update_success'),'', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function cancel(BeneficiaryTransactionCancelRequest $request)
    {
        try {

            $user = auth('team')->user()->user;
           
            $validated = $request->validated();

            $transaction_ids = $validated['beneficiary_transaction_ids'];

            $beneficiary_transactions = BeneficiaryTransaction::whereIn('unique_id', $transaction_ids)
                                        ->where('user_id', $user->id)
                                        ->lockForUpdate()
                                        ->get();

            throw_if($beneficiary_transactions->count() !== count($transaction_ids), new Exception(api_error(170), 170));

            $data = $this->repository->cancel($beneficiary_transactions, $validated);

            return $this->sendResponse(tr('transaction_cancel_success'),'', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function download_list(Request $request)
    {
        try {
            $user = auth('team')->user()->user;

            $beneficiary_transactions = $this->repository->list($request, $user, true);

            $data['url'] = $this->repository->export_list($beneficiary_transactions, $request->type ?? 1);

            return $this->sendResponse(tr('transaction_export_success'), '', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function payout_template(GetFormFieldsRequest $request)
    {
        try {

            $validated  = $request->validated();

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

            $response = $this->repository->bulk_store($user->user, $validated, $file, $user);

            $data['errors'] = $response['failed'];

            if(!empty($response['failed'])) {

                return $this->sendResponse(tr('bulk_import_failed'),'', $data);
            }

            $data['batch_id'] = $response['batch_id'] ?? null;

            return $this->sendResponse(tr('bulk_import_success'),'', $data);
        } catch (Exception $e) {
           
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
    public function direct(SendMoneyDirectRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user()->user;

            $transaction = $validated['transaction'];

            $beneficiary = $validated['beneficiary'];

            $sender = $validated['sender'];

            $sender['user_id'] = $user->id;

            DB::beginTransaction();

            $check_beneficiary_exists = BeneficiaryAccount::where('user_id', $user->id)->where('email', $beneficiary['beneficiaryAccount']['email'])->where('account_number', $beneficiary['beneficiaryAccount']['account_number'])->first();

            if(!$check_beneficiary_exists) {

                $beneficiary_repository = new BeneficiaryAccountRepository();

                $beneficiary_account = $beneficiary_repository->create($beneficiary, $user);
            }else {
                
                $beneficiary_account = $check_beneficiary_exists;
            }

            throw_if(!$beneficiary_account, new Exception(api_error(117), 117));

            $sender_repository = new SenderRepository();

            $check_sender_exists = Sender::where('user_id', $user->id)->where('id_number', $sender['id_number'])->first();

            if(!$check_sender_exists) {
    
                $sender = $sender_repository->create($sender, $user);
            }else {
                
                $sender = $check_sender_exists;
            }

            throw_if(!$sender, new Exception(api_error(131), 131));

            $storePayload = [
                'beneficiary_account_id' => $beneficiary_account->unique_id,
                'quote_id' => $validated['transaction']['quote_id'],
                'remitter_id' => $sender->unique_id ?? null,
                'remarks' => $validated['transaction']['remarks'] ?? null,
                'supporting_document' => $validated['transaction']['supporting_document'] ?? null,
                'txn_ref_no' => $validated['transaction']['txn_ref_no'] ?? null
            ];

            if(isset($validated['transaction']['client_reference_id'])) {

                $storePayload['client_reference_id'] = $validated['transaction']['client_reference_id'];
            }

            $transaction_service = new BeneficiaryTransactionRepository();     
            
            $transaction = $transaction_service->create($storePayload , $user);

            DB::commit();

            $data['beneficiary_transaction'] = new BeneficiaryTransactionResource($transaction);

            return $this->sendResponse(api_success(108), 108, $data);

        } catch (Exception $e) {
            
            DB::rollBack();
            
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function transaction_form_fields(Request $request)
    {
        try {

            $user = $request->user()->user;

            $transaction_form = FieldsHelper::transaction_form_fields($user) ?? [];

            $data['form_fields'] = $transaction_form;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function get_form_fields(GetFormFieldsRequest $request)
    {
        try {

            $user = $request->user()->user;

            $validated = $request->validated();

            $beneficiary_form_payload = array_merge($validated, ['type' => $validated['beneficiary_type']]);

            $beneficiary_form =  FieldsHelper::beneficiary_form_fields($beneficiary_form_payload, $user) ?? [];

            $sender_form = FieldsHelper::sender_fields($validated['remitter_type'], $user) ?? [];

            $transaction_form = FieldsHelper::transaction_form_fields($user) ?? [];

            $form = [
                'transaction' => $transaction_form,
                'beneficiary' => $beneficiary_form,
                'remitter' => $sender_form
            ];

            $data['form_fields'] = $form;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function request_proof(TransactionProofRequest $request)
    {
        try {

            $user = $request->user()->user;

            $validated = $request->validated();

            $this->repository->requestProof($validated, $user);

            return $this->sendResponse(api_success(114), 114, []);
        } catch (\Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode() ?: 500);
        }
    }

    public function get_proof(TransactionProofGetRequest $request)
    {
        try {

            $user = $request->user()->user;

            $validated = $request->validated();

            $transaction_proof = $this->repository->getProof($validated, $user);

            $data['transaction_proof'] = new TransactionProofResource($transaction_proof);

            return $this->sendResponse("", "", $data);
        } catch (\Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode() ?: 500);
        }
    }
}
