<?php

namespace App\Http\Controllers\Api;

use App\Enums\TelegramEvent;
use App\Helpers\CommissionsHelper;
use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Deposit\DepositCreateRequest;
use App\Http\Requests\Deposit\DepositQuoteRequest;
use App\Http\Requests\Deposit\DepositShowRequest;
use App\Http\Resources\DepositTransactionResource;
use App\Models\DepositTransaction;
use App\Models\VirtualAccount;
use App\Repositories\DepositTransactionRepository;
use App\Services\Telegram\TelegramNotifier;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;

class DepositController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new DepositTransactionRepository();
    }
    /**
     * Returns a list of deposit transactions associated with the given user.
     *
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function index(Request $request)
    {

        try {

            $user = $request->user();

            $deposits = $this->repository->list($user, $request);

            $data['total'] = $deposits['total'];

            $data['deposit_transactions'] = DepositTransactionResource::collection($deposits['deposit_transactions']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given deposit transaction.
     * 
     * This endpoint is used to show a deposit transaction.
     * 
     * @param DepositShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(DepositShowRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            $deposit = $this->repository->show($user, $validated['deposit_transaction_id']);

            $data['deposit_transaction'] = new DepositTransactionResource($deposit);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Stores a new deposit transaction.
     *
     * This endpoint is used to store a new deposit transaction.
     * 
     * @param DepositCreateRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function store(DepositCreateRequest $request)
    {
        try {

            $validated = $request->validated();
            
            $user = $request->user();

            $deposit_transaction = $this->repository->store($user, $validated);

            $data['deposit_transaction'] = new DepositTransactionResource($deposit_transaction);

            return $this->sendResponse(tr('deposit_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function export(Request $request)
    {
        try {

            $user = $request->user();

            $download_type = $request->input('type', FILE_TYPE_PDF);

            $url = $this->repository->export($request, $user, $download_type);

            $data['url'] = $url;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function quote(DepositQuoteRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            $quote = $this->repository->quote($user, $validated);

            $data['quote'] = $quote;
           
            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
    public function retry_deposit(Request $request)
    {

        try {

            Log::info('Retry request received for deposit transaction :' . $request->trxn);

            $transaction = DepositTransaction::where('unique_id', $request->trxn)->first();

            throw_if(!$transaction, new Exception(api_error(124), 124));

            if ($transaction->status == DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED) {

                $transaction->update([
                    'order_id' => generateOrderID()
                ]);

                Log::info('Order id updated for deposit transaction : ' . $transaction->unique_id);

                app(ProcessingUnit::class)->createDeposit($transaction, $transaction->user);
            } else {

                Log::info('Deposit transaction status is not failed for transaction : ' . $transaction->unique_id);
            }

            return $this->sendResponse(api_success(118), 118, []);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
