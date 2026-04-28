<?php

namespace App\ExternalServices\Compliance;

use App\Contracts\Kyc\KycContract;
use App\Models\Lookup;
use App\Services\Compliance\ComplianceTransactionService;
use App\Services\Incode\IncodeService;
use Exception;
use Illuminate\Support\Facades\Log;
use stdClass;

class ComplianceService
{
    public function make($txn, $user, $updateStatus = true)
    {
        try {

            Log::info("Compliance make initiated", [
                'txn_id' => $txn->id ?? null,
            ]);

            $transactionPayload = $this->preparePayload($txn, $user);

            Log::info("Compliance transaction payload : ", $transactionPayload);

            $complianceService = new ComplianceTransactionService();

            $response = $complianceService->create($txn, $transactionPayload);

            if (!$response['success']) {
                if ($updateStatus) {
                    $txn->update([
                        'status' => BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED
                    ]);
                }
                return null;
            }

            if (!$response || !isset($response['data'])) {

                Log::warning("Compliance API empty/invalid response", [
                    'txn_id' => $txn->id ?? null,
                    'response' => json_encode($response)
                ]);
                if ($updateStatus) {
                    $txn->update([
                        'status' => BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED
                    ]);
                }

                return null;
            }

            $this->storeComplianceResponse($txn, $response, $updateStatus);

            Log::info("Compliance initiated successfully", [
                'txn_id' => $txn->id,
                'compliance_txn_id' => $response['data']['transaction_id'] ?? null
            ]);

            return $response;

        } catch (Exception $e) {

            Log::error("Compliance initiation failed", [
                'txn_id' => $txn->id ?? null,
                'error' => $e->getMessage(),
            ]);

            if ($updateStatus) {
                $txn->update([
                    'status' => BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED
                ]);
            }

            return null;
        }
    }

    private function storeComplianceResponse($txn, $response, $updateStatus = true): void
    {
        try {

            $data = [
                'compliance_data' => $response['data'],
            ];

            if ($updateStatus) {

                $data['status'] = BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED;
            }

            $txn->update($data);

            Log::info("Compliance response stored", [
                'txn_id' => $txn->id,
                'compliance_data' => $response['data'] ?? null
            ]);
        } catch (Exception $e) {

            Log::warning("Compliance response store failed", [
                'txn_id' => $txn->id ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function preparePayload($payload, $user)
    {
        $sender_type = "INDIVIDUAL";

        $sender_name = "";

        if ($payload->sender) {

            $sender_type = $payload->sender->type == USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL";

            $sender_name = $payload->sender->first_name . ' ' . $payload->sender->last_name;
        } else {

            $sender_type = $user->type == USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL";

            $sender_name = $user->type == USER_TYPE_BUSINESS ? $user->userInformation->business_name : $user->first_name . ' ' . $user->last_name;
        }

        $from_country = get_alpha2_code($payload->quote->source->country);
        $to_country = get_alpha2_code($payload->quote->recipient_country);

        $corridor = ($from_country && $to_country) ? $from_country . "-" . $to_country : null;

        $data = [
            "externalId" => is_object($payload->order_id) ? $payload->order_id->toString() : (string) $payload->order_id,
            'merchantId' => $user->merchant ? $user->merchant->user->compliance_merchant_id : $user->compliance_merchant_id ?? null,
            "transaction_type" => "REMITTANCE",
            "transactionSubtype" => "INTERNATIONAL",
            "direction" => "OUTBOUND",

            "originator" => [
                "partyId" => $payload->sender ? $payload->sender->unique_id : $user->unique_id,
                "externalId" => $payload->sender ? $payload->sender->unique_id : $user->unique_id,
                "partyType" => $sender_type,

                "fullName" => $sender_name,
                "firstName" => $payload->sender ? $payload->sender->first_name : ($user->type == USER_TYPE_BUSINESS ? $user->userInformation->business_name : $user->first_name),
                "middleName" => $payload->sender ? ($payload->sender->middle_name ?? "") : ($user->type == USER_TYPE_BUSINESS ? "" : ($user->middle_name ?? "")),
                "lastName" => $payload->sender ? $payload->sender->last_name : ($user->type == USER_TYPE_BUSINESS ? "" : $user->last_name),
                "dateOfBirth" => $payload->sender ? ($payload->sender->dob ?? "") : $user->dob,
                "nationality" => $payload->sender ? ($payload->sender->nationality ?? "") : $user->userInformation->country,
                "countryOfResidence" => $payload->sender ? ($payload->sender->country ?? "") : $user->userInformation->country,
                "address" => [
                    "streetLine1" => $payload->sender ? ($payload->sender->address_1 ?? "") : ($user->userInformation->address_1 ?? ""),
                    "streetLine2" => $payload->sender ? ($payload->sender->address_2 ?? "") : ($user->userInformation->address_2 ?? ""),
                    "city" => $payload->sender ? ($payload->sender->city ?? "") : ($user->userInformation->city ?? ""),
                    "state" => $payload->sender ? ($payload->sender->state ?? "") : ($user->userInformation->state ?? ""),
                    "postalCode" => $payload->sender ? ($payload->sender->postal_code ?? "") : ($user->userInformation->postal_code ?? ""),
                    "country" => $payload->sender ? ($payload->sender->country ?? "") : $user->userInformation->country ?? "",
                ],

                "identification" => [
                    "type" => mapIdType($payload->sender ? (Lookup::findValuebyKey($payload->sender->id_type, LOOKUP_TYPE_ID_TYPE) ?? "") : (Lookup::findValuebyKey($user->userInformation->id_type, LOOKUP_TYPE_ID_TYPE) ?? "")),
                    "number" => $payload->sender ? ($payload->sender->id_number ?? "") : ($user->userInformation->id_number ?? ""),
                    "issuingCountry" => "",


                ],
                "phone" => [
                    "countryCode" => $payload->sender ? ($payload->sender->mobile_country_code ?? "") : ($user->mobile_country_code ?? ""),
                    "number" => $payload->sender ? ($payload->sender->mobile ?? "") : ($user->mobile ?? ""),
                ],

                "email" => $payload->sender ? ($payload->sender->email ?? "") : ($user->email ?? ""),
                "occupation" => "",
                "employer" => "",

            ],
            "beneficiary" => [

                "partyType" => $payload->beneficiaryAccount->type == USER_TYPE_BUSINESS ? "BUSINESS" : "INDIVIDUAL",
                "fullName" => $payload->beneficiaryAccount->type == USER_TYPE_BUSINESS ? $payload->beneficiaryAccount->business_name : ($payload->beneficiaryAccount->first_name . ' ' . $payload->beneficiaryAccount->last_name),
                "firstName" => $payload->beneficiaryAccount->type == USER_TYPE_BUSINESS ? $payload->beneficiaryAccount->business_name : $payload->beneficiaryAccount->first_name,
                "middleName" => $payload->beneficiaryAccount->type == USER_TYPE_BUSINESS ? "" : $payload->beneficiaryAccount->middle_name ?? "",
                "lastName" => $payload->beneficiaryAccount->type == USER_TYPE_BUSINESS ? "" : $payload->beneficiaryAccount->last_name,
                "dateOfBirth" => "",
                "relationshipToRemitter" => "CLIENT",

                "address" => [
                    "streetLine1" => $payload->beneficiaryAccount->beneficiaryAdditionalDetail->address_line1 ?? "",
                    "city" => $payload->beneficiaryAccount->beneficiaryAdditionalDetail->city ?? "",
                    "state" => $payload->beneficiaryAccount->beneficiaryAdditionalDetail->state ?? "",
                    "country" => $payload->beneficiaryAccount->beneficiaryAdditionalDetail->country ?? "",
                ],

                "phone" => [
                    "countryCode" => $payload->beneficiaryAccount ? ($payload->beneficiaryAccount->mobile_country_code ?? "") : ($user->mobile_country_code ?? ""),
                    "number" => $payload->beneficiaryAccount ? ($payload->beneficiaryAccount->mobile ?? "") : ($user->mobile ?? ""),
                ],


                "bankDetails" => [
                    "bankName" => $payload->beneficiaryAccount->bank_name,
                    "bankCode" => $payload->beneficiaryAccount->swift_code,
                    "branchName" => "",
                    "branchCode" => "",
                    "routingNumber" => $payload->beneficiaryAccount->routing_number ?? "",
                    "iban" => "",
                    "accountNumber" => $payload->beneficiaryAccount->account_number,
                    "accountType" => mapAccountType($payload->beneficiaryAccount->account_type),
                    "accountCurrency" => $payload->beneficiaryAccount->currency,
                ],

                "bankName" => $payload->beneficiaryAccount->bank_name,
                "bankCode" => $payload->beneficiaryAccount->swift_code,
                "accountNumber" => $payload->beneficiaryAccount->account_number,
                "accountType" => mapAccountType($payload->beneficiaryAccount->account_type),

                "walletDetails" => [
                    "provider" => "M-Pesa",
                    "walletId" => "string",
                    "accountName" => "string",
                ],
                "pickupDetails" => [
                    "agentNetwork" => "",
                    "pickupLocation" => "",
                    "pickupCountry" => "",
                    "pickupCity" => "",
                    "securityQuestion" => "",
                    "securityAnswer" => "",
                ],

            ],

            "amount" => (float) $payload->amount,
            "currency" => $payload->quote->source->currency,
            "amountUsd" => (float) $payload->amount,

            "destinationAmount" => (float) $payload->recipient_amount,
            "destinationCurrency" => $payload->receiving_currency,
            "exchangeRate" => (float) $payload->quote->fx_rate,

            "paymentMethod" => "CASH",
            "payoutMethod" => "CASH_PICKUP",

            "sourceOfFunds" => mapSourceOfFunds($payload->sender ? (Lookup::findValuebyKey($payload->sender->source_of_funds) ?? "") : (Lookup::findValuebyKey($user->userInformation->source_of_income) ?? "")),
            "purposeOfPayment" => mapPurposeOfPayment(Lookup::findValuebyKey($payload->beneficiaryAccount->beneficiaryAdditionalDetail->purpose_of_transaction) ??  ""),
            "originatorCountry" => $payload->sender ? $payload->sender->country : $user->userInformation->country,
            "beneficiaryCountry" => $payload->beneficiaryAccount->country,
            "corridor" => $corridor,

            "fees" => [
                "serviceFee" => 0,
                "fxFee" => 0,
                "totalFee" => (float) $payload->commission_amount,
                "feeCurrency" => "USD",
            ],

            "agent" => [
                "agentId" => "",
                "agentName" => "",
                "agentLocation" => "",
            ],

            "isExternalClient" => 1,
            "externalClient" => [
                'id' => config('services.compliance_externalClient.id'),
                'name' => config('services.compliance_externalClient.name'),
                'code' => config('services.compliance_externalClient.code'),
            ],

            "metadata" => new stdClass(),
        ];

        return $this->removeEmptyValues($data);
    }


    private function removeEmptyValues(array $data): array
    {
        foreach ($data as $key => $value) {

            if (is_array($value)) {

                $value = $this->removeEmptyValues($value);

                if (empty($value)) {
                    unset($data[$key]);
                    continue;
                }

                $data[$key] = $value;
                continue;
            }

            if ($value === null || $value === '') {
                unset($data[$key]);
            }
        }

        return $data;
    }
}
