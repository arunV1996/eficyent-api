<?php

namespace App\ExternalServices\BeneficiaryAccounts\Caliza;

use App\Contracts\BeneficiaryAccounts\BeneficiaryAccountContract;
use App\Models\MobileCountryCode;
use App\Models\VirtualAccount;
use App\Services\Caliza\BeneficiaryAccountService;
use Exception;

class CalizaBeneficiaryAccounts implements BeneficiaryAccountContract
{
    public function create($beneficiary, $user)
    {
        $payload = $this->preparePayload($beneficiary, $user);

        $beneficiaryaccountservice = new BeneficiaryAccountService();

        $response = $beneficiaryaccountservice->create($payload);

        throw_if((!$response['success']), new Exception($response['message']));

        if(!isset($response['data']) || (!isset($response['data']['id']))){

            throw new Exception(api_error(117), 117);
        }

        $this->store($beneficiary, $response);

        return $beneficiary;
    }

    public function store($beneficiary, $response){

        $beneficiary->update([
            'external_reference_id' => $response['data']['id'],
            'external_data' => $response['data'],
            'external_type' => EXTERNAL_TYPE_CALIZA,
            'status' => BENEFICIARY_ACCOUNT_ACTIVATED
        ]);
    }

    public function preparePayload($beneficiary, $user)
    {
        if ($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYOUT) {

            $MerchantAccount = $user->merchant->settings()
                ->where('key', 'caliza_account_id')
                ->select('value')
                ->first();

            if ($MerchantAccount) {
                $external_reference_id = $MerchantAccount->value;
            }else{

                $virtuaAccount = VirtualAccount::forUser($user)->first();

                throw_if(!$virtuaAccount, new Exception(api_error(120), 120));

                $external_reference_id = $virtuaAccount->external_reference_id;
            }  
        } else {
            $userservice = $user->userServices()
                ->where('service_type', EXTERNAL_TYPE_CALIZA)
                ->where('is_active', ACTIVE)
                ->select('external_reference_id')
                ->first();

            throw_if(!$userservice, new Exception(api_error(113), 113));

            $external_reference_id = $userservice->external_reference_id;
        }


        $isBusiness = (int) $beneficiary->type === USER_TYPE_BUSINESS;

        $network = $beneficiary->payment_rail ? $beneficiary->payment_rail : PAYMENT_RAIL_SWIFT;

        $base = [
            'beneficiaryId' => $external_reference_id,
            'currency' => $beneficiary->currency,
            'type' => strtoupper($network),
            'beneficiary_type' => $beneficiary->type ,
        ];

        if ($isBusiness) {
        
            $base['businessName'] = $beneficiary->business_name;
        
            $base['countryOfIncorporation'] = get_alpha2_code($beneficiary->business_country);
        } else {
        
            $base['individualName'] = trim($beneficiary->first_name . ' ' . $beneficiary->last_name);
        }

        $details = [
            'bankName' => $beneficiary->bank_name,
            'accountNumber' => $beneficiary->account_number,
            'routingNumber' => !empty($beneficiary->routing_number) ? $beneficiary->routing_number : null,
            'bankCountry' => get_alpha2_code($beneficiary->bank_country),
        ];

        if ($network === PAYMENT_RAIL_ACH) {

            $details['accountType'] = !empty($beneficiary->account_type)
                ? $beneficiary->account_type
                : 'Checking';
            $details['recipientAddress'] = $this->mapRecipientAddress($beneficiary->beneficiaryAdditionalDetail);

        }

        if ($network === PAYMENT_RAIL_WIRE) {
        
            $details['bankAddress'] = $this->mapBankAddress($beneficiary->beneficiaryAdditionalDetail);
        
            $details['recipientAddress'] = $this->mapRecipientAddress($beneficiary->beneficiaryAdditionalDetail);
        }

        if ($network === PAYMENT_RAIL_SWIFT) {
        
            $details += [
                'swiftCode' => $beneficiary->swift_code,
                // 'intermediaryBankSwiftCode' => $beneficiary->intermediary_bank_swift_code ?? null,
                // 'intermediaryBankName' => $beneficiary->intermediary_bank_name ?? null,
                'bankAddress' => $this->mapBankAddress($beneficiary->beneficiaryAdditionalDetail),
                'recipientAddress' => $this->mapRecipientAddress($beneficiary->beneficiaryAdditionalDetail),
            ];

            if(empty($beneficiary->account_number)){
                
                $details += [
                    'iban' => $beneficiary->iban
                ];
            }
        }

        $base['details'] = $details;

        return $base;
    }

    private function mapRecipientAddress($details)
    {
       
        return [
            'street1' => $details->address_line1 ?? '',
            'street2' => $details->address_line2 ?? '',
            'city' => $details->city ? $details->city : 'US',
            'state' => !empty($details->state)
                ? $details->state
                : 'US',
            'country' => get_alpha2_code($details->country) ?? '',
            'postalCode' => $details->postal_code ? $details->postal_code : '0000',
        ];
    }

    private function mapBankAddress($details)
    {

        return [
            'street1' => $details->bank_address_line1 ? $details->bank_address_line1 : 'NOT PROVIDED',
            'street2' => $details->bank_address_line2 ?? '',
            'city' => $details->bank_city ? $details->bank_city : 'US',
            'state' => !empty($details->bank_state)
                ? $details->state
                : 'US',
            'country' => get_alpha2_code($details->bank_country) ?? 'US',
            'postalCode' => $details->bank_postal_code ? $details->bank_postal_code : '0000',
        ];
    }
}
