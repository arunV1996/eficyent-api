<?php

namespace App\ExternalServices\Remittance;

use App\Models\Lookup;
use App\Services\Remittance\RemittanceTransactionService;
use Exception;
use Illuminate\Support\Facades\Log;

class RemittanceService
{
    public function make($txn, $user)
    {
        try {

            Log::info("Remittance initiated", ['txn_id' => $txn->id]);

            $payload = $this->preparePayload($txn, $user);

            Log::info("Remittance transaction payload", [
                'payload' => $payload ?? []
            ]);

            $response = app(RemittanceTransactionService::class)->create($txn , $payload);

            if (empty($response) || empty($response['data']) || !array_key_exists('success', $response['data'])) {
                Log::warning("Remittance failed response", [
                    'txn_id' => $txn->id,
                    'response' => $response
                ]);
                return null;
            }

            $this->storeResponse($txn, $response['data']);

            Log::info("Remittance success", ['response' => $response['data']]);

            return $response;

        } catch (Exception $e) {

            Log::error("Remittance failed", [

                'txn_id' => $txn->id,
                'error' => $e->getMessage()
            ]);

            return null;
        }
    }

    private function storeResponse($txn, $data): void
    {
        $txn->update([

            'remittance_data' => $data
        ]);
    }

    private function preparePayload($txn, $user): array
    {
        $isBusiness = $txn->sender->type == USER_TYPE_BUSINESS;

        $sourceOfFunds = $txn->sender? Lookup::findValuebyKey($txn->sender->source_of_funds): Lookup::findValuebyKey($user->userInformation->source_of_income);

        $base = [
            "order_id" => (string) $txn->unique_id,
            "to_currency" => $txn->quote->receiving_currency,
            "amount" => (float) $txn->quote->amount,
            "exchange_rate" => (float) $txn->quote->fx_rate,
            "address_line_1" => $user->userInformation->address_1 ?? "",
            "address_line_2" => $user->userInformation->address_2 ?? "",
            "city" => $user->userInformation->city ?? "",
            "state" => $user->userInformation->state ?? "",
            "country" => get_alpha2_code($user->userInformation->country ?? ""),
            "postal_code" => $user->userInformation->postal_code ?? "",
            "email" => $user->email,
            "phone" => $user->mobile,
            "source_of_funds" => mapSourceOfFunds($sourceOfFunds ?? ''),
            "beneficiary_first_name" => $txn->beneficiaryAccount->first_name,
            "beneficiary_last_name" => $txn->beneficiaryAccount->last_name,
            "beneficiary_type" => $isBusiness ? "BUSINESS" : "INDIVIDUAL",
            "receiving_currency" => $txn->quote->receiving_currency,
            "recipient_country" => get_alpha2_code($txn->beneficiaryAccount->country),
            "account_type" => $txn->beneficiaryAccount->account_type ?? "",
            "account_name" => $txn->beneficiaryAccount->account_name ?? "",
            "beneficiary_description" => "Remittance transfer",
            "bank_name" => $txn->beneficiaryAccount->bank_name,
            "created_at" => $txn->created_at,
            "updated_at" => $txn->updated_at,

        ];

        // C2C (Individual)
        
        if (!$isBusiness) {

            return $this->removeEmptyValues(array_merge($base, [
                "payout_type" => "C2C",
                "side" => "SELL",
                "first_name" => $txn->sender->first_name ?? "",
                "middle_name" => $txn->sender->middle_name ?? "",
                "last_name" => $txn->sender->last_name ?? "",
                "type" => "individual",
                "id_type" => mapIdType( $txn->sender ? (Lookup::findValuebyKey($txn->sender->id_type, LOOKUP_TYPE_ID_TYPE) ?? "") : (Lookup::findValuebyKey($user->userInformation->id_type, LOOKUP_TYPE_ID_TYPE) ?? "")),
                "id_number" => $txn->sender->id_number ?? "",
            ]));
        }


        $ubo = [];

        $persons = $txn->sender->business_persons ?? [];

        if (is_string($persons)) {
            $persons = json_decode($persons, true) ?? [];
        }

        $count = count($persons);
        $remaining = 100;

        foreach ($persons as $index => $person) {

            $percentage = ($index === $count - 1) ? $remaining : round(100 / $count, 2);

            $remaining -= $percentage;

            $ubo[] = [
                "first_name" => $person['first_name'] ?? '',
                "last_name" => $person['last_name'] ?? '',
                "id_type" => mapIdType($person['id_type'] ?? ''),
                "id_number" => $person['id_number'] ?? '',
                "email" => $person['email'] ?? '',
                "mobile" => $person['mobile'] ?? '',
                "mobile_code" => $person['mobile_country_code'] ?? '',
                "address_line_1" => $person['address_1'] ?? '',
                "address_line_2" => $person['address_2'] ?? '',
                "city" => $person['city'] ?? '',
                "state" => $person['state'] ?? '',
                "country" => $person['country'] ?? '',
                "postal_code" => $person['postal_code'] ?? '',
                "nationality" => $person['country'] ?? '',
                "ownership_percentage" => $percentage,
            ];
        }

        // B2B (Business)
        return $this->removeEmptyValues(array_merge($base, [
            "payout_type" => "B2B",

            "company_name" => $user->userInformation->business_name ?? "",
            "type" => "business",
            "ubo" => $ubo,
            "incorporation_certificate" => "",
            "tax_certificate" => "",
            "address_proof" => "",
        ]));
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