<?php

namespace App\Http\Controllers\Api;

use Exception;
use App\Helpers\Helper;
use App\Models\UserService;
use Illuminate\Http\Request;
use App\Models\VirtualAccount;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Repositories\UserWalletRepository;
use App\Http\Resources\VirtualAccountResource;
use App\Repositories\VirtualAccountRepository;
use App\Factories\Onboarding\OnboardingFactory;
use App\Http\Requests\VirtualAccounts\ActivateRequest;
use App\Factories\VirtualAccounts\VirtualAccountFactory;
use App\Http\Requests\VirtualAccounts\GetBalanceRequest;
class VirtualAccountController extends Controller
{
    protected $repository;

    protected $wallet_repository;

    public function __construct()
    {
        $this->repository = new VirtualAccountRepository();

        $this->wallet_repository = new UserWalletRepository();
    }
    /**
     * Get the current user virtual accounts.
     *
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();

            $accounts = $this->repository->getAccountsForUser($user, $request);

            $data['total'] = $accounts['total'];

            $data['accounts'] = VirtualAccountResource::collection($accounts['accounts']);

            return $this->sendResponse('', '', $data);

        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Fetches the available banks for a user virtual account.
     *
     * This endpoint is used to fetch the available banks for a user virtual account.
     *
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function available_banks(Request $request)
    {

        try {
            $user = $request->user();

            if ($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYOUT) {

                $data['available_banks'] = [];
            } else {

                $available_banks = available_banks($user);

                foreach ($available_banks as &$bank) {

                    $is_onboarded = UserService::where('user_id', $user->id)
                        ->where('service_type', $bank['key'])
                        ->first();

                    $bank['status'] = $is_onboarded ? $is_onboarded->status : ONBOARDING_STATUS_PENDING;
                }

                $available_banks = array_values(array_filter(
                    $available_banks,
                    fn($bank) => $bank['status'] <= ONBOARDING_STATUS_PENDING
                ));

                $existingAccountTypes = VirtualAccount::forUser($user)
                    ->where('status', VIRTUAL_ACCOUNT_STATUS_CREATED)
                    ->pluck('external_type')
                    ->unique()
                    ->toArray();


                $available_banks = array_values(array_filter(
                    $available_banks,
                    fn($bank) => !in_array($bank['key'], $existingAccountTypes, true)
                ));

                foreach ($available_banks as &$bank) {

                    $bank['status'] = onboarding_status_label($bank['status']);
                }

                $data['available_banks'] = $available_banks;
            }

            return $this->sendResponse(tr('available_banks_fetched'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Activate a user virtual account.
     *
     * This endpoint is used to activate a user virtual account.
     *
     * @param ActivateRequest $request
     * @param OnboardingFactory $onboardingFactory
     * @return JsonResponse
     * @throws Exception
     */
    public function activate(ActivateRequest $request, OnboardingFactory $onboardingFactory , VirtualAccountFactory $virtualAccountFactory)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $user_services = $user->userServices()->where('service_type', $validated['type'])->first();

            $user_virtual_accounts = VirtualAccount::forUser($user)->where('external_type', $validated['type'])->first();

            throw_if($user_services && $user_virtual_accounts, new Exception(api_error(115), 115));

            $data['update_required'] = false;

            if($validated['type'] == EXTERNAL_TYPE_FVBANK){

               $result = Helper::get_file_update_key($user, $validated['type']);

                if ($result['required_to_update_fields'] === 1) {

                    $data['update_required'] = true;

                    return $this->sendResponse('', '', $data);
                }
            }

            $onboarding = $onboardingFactory->resolve($validated['type']);

            $onboarding->make($user);

            $virtual_account = $virtualAccountFactory->resolve($validated['type']);

            $virtual_account->make($user);

            $data['user'] = new UserResource($user, METHOD_PROFILE);

            return $this->sendResponse(tr('virtual_account_inititated'), '', []);

        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get the balance of a user virtual account.
     *
     * This endpoint is used to get the balance of a user virtual account.
     *
     * @param GetBalanceRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function get_balance(GetBalanceRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $data['account'] = new VirtualAccountResource($this->repository->getBalance($user, $validated), $user);

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

            $data['account'] = new VirtualAccountResource($this->repository->show($user, $validated), $user);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns the balances of a user virtual accounts.
     *
     * This endpoint is used to fetch the balances of a user virtual accounts.
     *
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function balances(Request $request)
    {
        try {

            $user = $request->user();

            $virtual_accounts = VirtualAccount::forUser($user)->get();

            $balances = [];

            foreach ($virtual_accounts as $virtual_account) {

                $balances[] = [
                    'currency' => $virtual_account->currency,
                    'balance' => Helper::bankBalance($user, $virtual_account),
                ];
            }

            $data['balances'] = $balances;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
