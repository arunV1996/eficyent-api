<?php

namespace App\ExternalServices\BeneficiaryAccounts\FvBank;

use App\Contracts\BeneficiaryAccounts\BeneficiaryAccountContract;
use App\Services\FvBank\BeneficiaryAccountService;
use Exception;

class FvBankBeneficiaryAccounts implements BeneficiaryAccountContract
{
   public function create($beneficiary, $user): array
  {
    try {

            if(!config('services.fv_bank_micro.is_enabled')){

                return [];
            }

            $beneficiary_id = $user->userServices()->where('service_type', EXTERNAL_TYPE_FVBANK)->where('is_active', ACTIVE)->value('external_reference_id');

            throw_if(!$beneficiary_id, new Exception(api_error(178), 178));

            $service = new BeneficiaryAccountService();

            $beneficiary_payload = $this->buildPayload($beneficiary, $beneficiary_id);

            $response = $service->createBeneficiary($beneficiary_payload);

            info("Create Beneficiary Response: " . json_encode($response));

            throw_if(!$response['success'], new Exception($response['message'] ?? tr('something_went_wrong'), $response['code'] ?? 30006));

            if (!($response['success'] ?? false)) {

                throw new Exception($response['message'] ?? tr('something_went_wrong'), $response['code'] ?? 30006);
            }

            $this->store($beneficiary, $response);

            return $response;

        } catch (Exception $e) {

            return ['success' => false, 'message' => $e->getMessage(), 'code' => $e->getCode() ?: 30006,'data'    => []];
        }
    }

    public function store($beneficiary, $response){

        $beneficiary->update([
            'external_reference_id' => $response['data']['PaymentInstrumentID'] ?? null,
            'external_data' => $response['data'],
            'external_type' => EXTERNAL_TYPE_FVBANK,
            'status' => BENEFICIARY_ACCOUNT_ACTIVATED
        ]);
    }

    /**
     * Build FV Bank beneficiary payload dynamically
     */
    private function buildPayload($beneficiary, $beneficiary_id): array
    {

        $paymentType = format_payment_type($beneficiary->payment_rail);

        $account_type = $beneficiary->account_type == "Savings" ? "Saving" : "Checking";

        $base = [
            'BeneficiaryId' => $beneficiary_id,
            'Payment_Type'  => $paymentType,
            'Nickname' => trim(($beneficiary->first_name ?? '') . ' ' . ($beneficiary->last_name ?? '')) ?: $beneficiary->business_name,
            'Beneficiary_Bank_Name'    => $beneficiary->bank_name ?? null,
            'Beneficiary_Bank_Country' => $beneficiary->bank_country ?? null,
        ];


        if (in_array($paymentType, ['BUS_USD_Account.Business_ACH', 'BUS_USD_Account.Domestic_Wire_BUS'], true)) {

            $base += [
                'Account_Number' => $beneficiary->account_number ?? null,
                'Routing_Number' => $beneficiary->routing_number ?? null,
                'Account_Type'   => $account_type,
            ];
        }

        if ($paymentType == 'BUS_USD_Account.BUS_International_Transfer') {

            $base += [
                'Account_Number'   => $beneficiary->account_number ?? null,
                'Account_Type'     => $account_type,
                'Swift_Bic'        => $beneficiary->swift_code ?? null,
                'Beneficiary_IBAN' => $beneficiary->iban ?? null,
                'Bank_Name'        => $beneficiary->bank_name ?? null,
                'Bank_Address'     => $beneficiary->beneficiaryAdditionalDetail->bank_address ?? null,
                'Bank_City'        => $beneficiary->beneficiaryAdditionalDetail->bank_city ?? null,
                'Bank_State'       => $beneficiary->beneficiaryAdditionalDetail->bank_state ?? null,
                'Bank_Country'     => $beneficiary->beneficiaryAdditionalDetail->bank_country ?? null,
                'Bank_Postal_Code' => $beneficiary->beneficiaryAdditionalDetail->bank_postal_code ?? null,
            ];
        }

         return $base;
    }
}
