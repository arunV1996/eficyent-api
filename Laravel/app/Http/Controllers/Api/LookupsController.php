<?php

namespace App\Http\Controllers\Api;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Lookups\ReceivingCountriesRequest;
use App\Http\Resources\SupportedCountryResource;
use App\Services\Diginine\LookupService;
use Exception;
use Illuminate\Http\Request;
use Akaunting\Setting\Facade as Setting;
use App\Http\Requests\Lookups\DepositLookupRequest;
use App\Http\Requests\Lookups\GetBanksRequest;
use App\Http\Requests\Lookups\RefreshRateRequest;
use App\Http\Resources\DepositWalletResource;
use App\Http\Resources\RatesResource;
use App\Models\AdminWallet;
use App\Models\MerchantSetting;
use App\Models\SupportedCountry;
use App\Repositories\LookupRepository;

class LookupsController extends Controller
{

    protected $repository;

    public function __construct(){

        $this->repository = new LookupRepository();
    }
    /**
     * Return a list of mobile country codes
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function mobile_country_codes(Request $request)
    {
        try {

            $data['mobile_country_codes'] = Helper::get_mobile_country_codes();

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of available networks for the beneficiary account.
     * 
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function payment_rails(Request $request)
    {
        try {

            $data['payment_rails'] = Helper::get_payment_rails();

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of countries.
     *
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function countries(Request $request)
    {
        try {

            $data['countries'] = Helper::get_countries();

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of states for the given country code.
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function get_states(Request $request)
    {
        try {

            $data['states'] = Helper::get_states($request->country_code);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of supported countries for the given payment type and recipient type.
     *
     * @param ReceivingCountriesRequest $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function receiving_countries(ReceivingCountriesRequest $request)
    {
        try{

            $user = $request->user();

            $validated = $request->validated();

            $data = $this->repository->receiving_countries($validated, $user);

            return $this->sendResponse('', '', $data);

        }catch(Exception $e){
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Returns a list of service banks for the given country code.
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function banks(GetBanksRequest $request)
    {
        try {

            $data['banks'] = Helper::get_service_banks($request->country_code);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function test()
    {

        $lookups = new LookupService();

        // $countries = SupportedCountry::where('external_type', EXTERNAL_TYPE_DIGININE)->pluck('country_code')->toArray();

        // foreach($countries as $country_code){

        //     $payload = [
        //         'receiving_country_code' => get_alpha2_code($country_code),
        //         'size' => 5000
        //     ];
            
        //     $response = $lookups->getBanks($payload);

        //     $syncedCount = Helper::syncDiginineBanks($response['data'] , get_alpha3_code($payload['receiving_country_code']));
        // }
        
        // $response = $lookups->getLookups([]);

        // $syncedCount = Helper::syncDiginineLookups($response['data']);

        $response = $lookups->getServiceCorridor([]);

        $syncedCount = Helper::syncDiginineCountries($response['data']);

        return $this->sendResponse('', '', ['synced_count' => $syncedCount]);
    }

    public function get_rates(Request $request)
    {
        try {

            $user = $request->user();

            $data['rates'] = $this->repository->rates($user, $request->all());

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function refresh_rates(RefreshRateRequest $request)
    {
        try {
            $user = $request->user();

            $validated = $request->validated();

            $response = $this->repository->refresh_rates($user, $validated);

            $data['rate'] = $response;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function deposit_lookups(DepositLookupRequest $request)
    {
        try {

            $validated = $request->validated();

            $lookups = Helper::get_deposit_lookups($validated);

            $data['lookups'] = $lookups;

            return $this->sendResponse('', '', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function deposit_wallets(Request $request)
    {
        try {

            $validated = $request->all();

            $wallets = $this->repository->deposit_wallets($validated);

            $data['wallets'] = DepositWalletResource::collection($wallets);
          
            return $this->sendResponse('', '', $data);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
