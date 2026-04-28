<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Deposit\DepositCreateRequest;
use App\Http\Requests\Deposit\DepositQuoteRequest;
use App\Http\Requests\Deposit\DepositShowRequest;
use App\Http\Resources\DepositTransactionResource;
use App\Repositories\DepositTransactionRepository;
use Exception;
use Illuminate\Http\Request;

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
     * This endpoint is used to retrieve a list of deposit transactions.
     * 
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function index(Request $request)
    {

        try {

            $user = auth('team')->user();

            $deposits = $this->repository->list($user->user, $request, false, $user);

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

            $user = auth('team')->user();

            $deposit = $this->repository->show($user->user, $validated['deposit_transaction_id']);

            throw_if(!$deposit, new Exception(api_error(124), 124));

            $data['deposit_transaction'] = new DepositTransactionResource($deposit);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function export(Request $request)
    {
        try {

            $user = auth('team')->user()->user;

            $download_type = $request->input('type', FILE_TYPE_PDF);

            $url = $this->repository->export($request, $user, $download_type);

            $data['url'] = $url;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function store(DepositCreateRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = auth('team')->user();

            $deposit_transaction = $this->repository->store($user->user, $validated);

            $data['deposit_transaction'] = new DepositTransactionResource($deposit_transaction);

            return $this->sendResponse(tr('deposit_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function quote(DepositQuoteRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = auth('team')->user();

            $quote = $this->repository->quote($user, $validated);

            $data['quote'] = $quote;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
