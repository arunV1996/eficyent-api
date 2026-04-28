<?php

namespace App\ExternalServices\AccountValidation\Surepass;

use App\Contracts\AccountValidation\AccountValidationContract;
use App\Models\BeneficiaryAccountValidation;
use App\Services\HeraldSumsub\HeraldKycService;
use App\Services\Surepass\ValidationService;
use Exception;
use Illuminate\Support\Facades\DB;

class SurepassAccountValidation implements AccountValidationContract
{
    public function validate($payload, $user)
    {
        $validation_payload = $this->preparePayload($payload);

        $valdiationService = new ValidationService();

        $response = $valdiationService->validate($validation_payload);

        if(!$response['success']) {
            
            return null;
        }

        $beneficiaryAccount = $this->createBeneficiaryAccountValidation($user, $response['data'] ?? [], $payload);

        return $beneficiaryAccount;
    }

    private function preparePayload($payload)
    {
        return [
            'id_number' => $payload['account_number'],
            'ifsc' => $payload['ifsc'],
            'ifsc_details' => true,
            'check_nre_nro' => true
        ];
    }

    private function createBeneficiaryAccountValidation($user, $response, $payload)
    {
        $checkExists = BeneficiaryAccountValidation::where('account_number', $payload['account_number'])->first();

        if($checkExists) {

            return $checkExists;
        }
        $beneficiaryAccount = DB::transaction(function () use ($user, $response, $payload) {

            $data = $response['data'] ?? [];

            if (isset($data['status']) && $data['status'] != "success" && $data['status'] != "nre_account") {

                $status = BENEFICIARY_ACCOUNT_VALIDATION_STATUS_FAILED;
            } else {
                $status = BENEFICIARY_ACCOUNT_VALIDATION_STATUS_SUCCESS;
            }
            
            $beneficiaryAccount = BeneficiaryAccountValidation::create([
                'user_id' => $user->id,
                'account_name' => $data['full_name'] ?? '',
                'account_number' => $payload['account_number'],
                'code' => $payload['ifsc'],
                'validation_service' => ID_VERIFIED_BY_SUREPASS,
                'external_reference_id' => $data['client_id'] ?? '',
                'external_status' => $data['status'] ?? '',
                'external_data' => $data,
                'remarks' => isset($data['remarks']) && $data['remarks'] != "" ? $data['remarks'] : $response['message'] ?? '',
                'is_account_exists' =>  isset($data['account_exists']) && $data['account_exists'] ? 1 : 0,
                'is_nre_account' => isset($data['status']) && $data['status'] == "nre_account" ? 1 : 0,
                'status' => $status
            ]);

            throw_if(!$beneficiaryAccount, new Exception(api_error(179), 179));

            return $beneficiaryAccount;
        });

        return $beneficiaryAccount;
    }
}
