<?php

namespace App\ExternalServices\VirtualAccounts\Caliza;

use App\Contracts\VIrtualAccounts\VirtualAccountContract;
use App\Services\Caliza\VirtualAccountService;
use Exception;

class CalizaVirtualAccounts implements VirtualAccountContract
{
    public function make($user)
    {
        $payload['user_id'] = $user->userServices()->where('service_type', EXTERNAL_TYPE_CALIZA)->first()->external_reference_id ?? null;

        $virtualaccountservice = new VirtualAccountService();

        $response = $virtualaccountservice->create($payload);

        // throw_if(!$response['success'], new Exception($response['message']));

        return $response;
    }

    public function get($user)
    {
        $payload['user_id'] = $user->userServices()->where('service_type', EXTERNAL_TYPE_CALIZA)->first()->external_reference_id ?? null;

        $virtualaccountservice = new VirtualAccountService();

        $response = $virtualaccountservice->get_virtual_accounts($payload);

        throw_if(!$response['success'], new Exception($response['message']));

        return $response;
    }

    public function get_balance($user,$virtual_account)
    {
        $payload['user_id'] = $user->userServices()->where('service_type', EXTERNAL_TYPE_CALIZA)->first()->external_reference_id ?? null;

        $payload['currency'] = $virtual_account->currency;

        $virtualaccountservice = new VirtualAccountService();

        $response = $virtualaccountservice->get_virtual_account_balance($payload);

        throw_if(!$response['success'], new Exception($response['message']));

        $balance = 0;

        if(isset($response['data']))
        {
            $balance = $response['data']['total'];
        }

        return $balance;
    }
}
