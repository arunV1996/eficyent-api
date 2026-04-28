<?php

namespace App\ExternalServices\Kyc\Incode;

use App\Contracts\Kyc\KycContract;
use App\Services\Incode\IncodeService;
use Exception;

class IncodeKyc implements KycContract
{
    public function make($user)
    {
        $payload = [
            "configurationId" => config('services.incode.configuration_id'),
        ];

        $kybService = new IncodeService();

        $response = $kybService->initiate($payload);

        throw_if(!$response['success'], new Exception($response['message'], $response['code']));

        $url_payload = [
            "hardwareId" => $response['data']['token'],
        ];

        $get_url_response = $kybService->get_url($url_payload);

        throw_if(!$get_url_response['success'], new Exception($get_url_response['message'], $get_url_response['code']));

        $this->update_status($user, IDENTITY_VERIFICATION_INITIATED, $response['data']);

        return $get_url_response['data']['url'];
    }

    public function status($user)
    {

        $id_verification_data = $user->id_verification_data;

        $payload = [
            "interviewId" =>  $id_verification_data['interviewId'] ?? '',
            "hardwareId" => $id_verification_data['token'] ?? '',
        ];

        $kybService = new IncodeService();

        $get_score_response = $kybService->get_score($payload);

        throw_if(!$get_score_response['success'], new Exception($get_score_response['message'], $get_score_response['code']));

        $data = $get_score_response['data'];

        if (isset($data['overall']) && $data['overall']['status']) {

            $status = format_incode_status($data['overall']['status']);

            $update_data = null;

            if ($status == IDENTITY_VERIFICATION_COMPLETED) {

                $update_data = $data;
            }

            $this->update_status($user, $status, $update_data);
        }
    }

    public function update_status($user, $status, $data = null)
    {
        $user->update([
            'id_verification' => $status,
            'id_verified_by'  => ID_VERIFIED_BY_INCODE,
        ]);

        if (!is_null($data)) {

            $user->update([
                'id_verification_data' => $data
            ]);
        }

        if ($status == IDENTITY_VERIFICATION_COMPLETED) {
            
            $user->update([
                'onboarding_step' => ONBOARDING_STEP_FOUR_COMPLETED
            ]);
        }
    }
}
