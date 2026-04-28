<?php

namespace App\ExternalServices\Kyc\Herald;

use App\Contracts\Kyc\KycContract;
use App\Services\HeraldSumsub\HeraldKycService;
use Exception;

class HeraldSumsubKyc implements KycContract
{
    public function make($user)
    {
        $userData = [
            'first_name'  => $user->first_name,
            'last_name'   => $user->last_name,
            'middle_name' => $user->middle_name ?? '',
            'dob'         => $user->dob ?? null,
            'email'       => $user->email,
            'mobile'      => $user->mobile,
        ];

        $kybService = new HeraldKycService();

        $response = $kybService->initiate($userData);

        throw_if(!$response['success'], new Exception($response['message'], $response['code']));

        $kyc_url = "";

        if (isset($response['data']) && isset($response['data']['kyc_status'])) {

            $kyc_status = $response['data']['kyc_status'];

            $this->update_status($user, $kyc_status);

            if (isset($response['data']['redirect_url'])) {

                $kyc_url = $response['data']['redirect_url'];
            }
        }

        return $kyc_url;
    }

    public function status($user)
    {
        $kybService = new HeraldKycService();

        $response = $kybService->check_status($user->email);

        throw_if(!$response['success'], new Exception($response['message'], $response['code']));

        if (isset($response['data']) && isset($response['data']['kyc_status'])) {

            $kyc_status = $response['data']['kyc_status'];

            $this->update_status($user, $kyc_status, $response['data']);
        }
    }

    public function update_status($user, $status, $data = null)
    {
        if (in_array($status, ['Approved'])) {

            $user->update([
                'id_verification' => IDENTITY_VERIFICATION_COMPLETED,
                'id_verified_by'  => ID_VERIFIED_BY_HERALD_SUMSUB,
                'onboarding_step' => ONBOARDING_STEP_FOUR_COMPLETED
            ]);
        } elseif (in_array($status, ['Initiated'])) {

            $user->update([
                'id_verification' => IDENTITY_VERIFICATION_INITIATED
            ]);
        }

        if(!is_null($data)){
          
            $user->update([
                'id_verification_data' => $data
            ]);
        }
    }
}
