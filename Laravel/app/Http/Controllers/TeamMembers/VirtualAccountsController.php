<?php

namespace App\Http\Controllers\TeamMembers;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\VirtualAccounts\GetBalanceRequest;
use App\Http\Resources\VirtualAccountResource;
use App\Models\VirtualAccount;
use App\Repositories\VirtualAccountRepository;
use Exception;
use Illuminate\Http\Request;

class VirtualAccountsController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new VirtualAccountRepository();
    }
    /**
     * Get the current user virtual accounts.
     * 
     * This endpoint is used to retrieve a list of virtual accounts associated with the given user.
     * 
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function index(Request $request)
    {
        try {

            $user = auth('team')->user();
            
            $accounts = $this->repository->getAccountsForUser($user->user, $request, $user);

            $data['total'] = $accounts['total'];

            $data['accounts'] = VirtualAccountResource::collection($accounts['accounts']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Retrieves the balance of a user virtual account.
     * 
     * This endpoint is used to retrieve the balance of a user virtual account.
     * 
     * @param GetBalanceRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function get_balance(GetBalanceRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            $data['account'] = new VirtualAccountResource($this->repository->getBalance($user->user, $validated, $user));

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given user virtual account.
     * 
     * This endpoint is used to show a user virtual account.
     * 
     * @param GetBalanceRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(GetBalanceRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            if ($request->with_balance) {

                $validated['with_balance'] = 1;
            }

            $data['account'] = new VirtualAccountResource($this->repository->show($user->user, $validated, $user));

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
