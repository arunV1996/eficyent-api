<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Wallets\ConvertRequest;
use App\Http\Requests\Wallets\WalletShowRequest;
use App\Http\Requests\Wallets\WalletTransactionShowRequest;
use App\Http\Resources\UserWalletResource;
use App\Http\Resources\WalletTransactionResource;
use App\Repositories\UserWalletRepository;
use Exception;
use Illuminate\Http\Request;

class WalletController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new UserWalletRepository();
    }

    public function index(Request $request)
    {
        try {

            $user = auth('team')->user()->user;

            $wallets = $this->repository->list($user, $request);

            $data['total'] = $wallets['total'];

            $data['wallets'] = UserWalletResource::collection($wallets['wallets']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show(WalletShowRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $wallet = $this->repository->show($user->user, $validated['wallet_id']);

            $data['wallet'] = new UserWalletResource($wallet);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function convert(ConvertRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $wallet_transaction = $this->repository->convert($user, $validated);

            $data['wallet_transaction'] = new WalletTransactionResource($wallet_transaction);

            return $this->sendResponse(api_success(108), 108, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function transactions(Request $request)
    {
        try{

            $user = auth('team')->user()->user;

            $validated = $request->all();

            $wallet_transactions = $this->repository->walletTransactions($user, $validated);

            $data['total'] = $wallet_transactions['total'];

            $data['wallet_transactions'] = WalletTransactionResource::collection($wallet_transactions['wallet_transactions']);
            
            return $this->sendResponse('', '', $data);
        }catch(Exception $e){
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show_transaction(WalletTransactionShowRequest $request)
    {
        try{

            $user = auth('team')->user()->user;

            $validated = $request->all();

            $wallet_transaction = $this->repository->showTransaction($user, $validated['wallet_transaction_id']);

            $data['wallet_transaction'] = new WalletTransactionResource($wallet_transaction);

            return $this->sendResponse('', '', $data);

        }catch(Exception $e){
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
