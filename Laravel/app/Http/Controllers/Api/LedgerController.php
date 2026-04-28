<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ledger\LedgerListRequest;
use App\Http\Requests\Ledger\LedgerShowRequest;
use App\Http\Resources\LedgerResource;
use App\Http\Resources\WalletTransactionResource;
use App\Models\BeneficiaryTransaction;
use App\Models\DepositTransaction;
use App\Models\Ledger;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use App\Repositories\LedgerRepository;
use App\Repositories\UserWalletRepository;
use Exception;
use Illuminate\Http\Request;

class LedgerController extends Controller
{
    protected $repository;

    protected $walletRepository;

    public function __construct()
    {
        $this->repository = new LedgerRepository();

        $this->walletRepository = new UserWalletRepository();
    }
    /**
     * Returns a list of ledger records associated with the given user.
     * 
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     *
     */
    public function index(LedgerListRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $ledgers = $this->repository->list($validated, $user);

            $data['total'] = $ledgers['total'];

            $data['ledgers'] = LedgerResource::collection($ledgers['ledgers']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given ledger.
     *
     * This endpoint is used to show a ledger.
     *
     * @param LedgerShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(LedgerShowRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            $ledger = $this->repository->show($user, $validated['ledger_id']);

            throw_if(!$ledger, new Exception(api_error(149), 149));

            $data['ledger'] = new LedgerResource($ledger);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function export(LedgerListRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $download_type = $request->input('type', FILE_TYPE_PDF);

            $url = $this->repository->export($validated, $user, $download_type);

            $data['url'] = $url;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
