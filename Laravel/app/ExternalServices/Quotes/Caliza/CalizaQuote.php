<?php

namespace App\ExternalServices\Quotes\Caliza;

use App\Contracts\Quotes\QuoteContract;
use App\Models\BeneficiaryAccount;
use App\Services\Caliza\QuoteService;
use Exception;

class CalizaQuote implements QuoteContract
{
    public function create($payload, $user)
    {
        $formatted_payload = $this->format_payload($payload, $user);

        $quoteservice = new QuoteService();

        $response = $quoteservice->create($formatted_payload);

        throw_if((!$response['success']), new Exception($response['message']));

        throw_if((!$response['data']), new Exception($response['message']));

        $generated_quote = $response['data'] ?? [];

        throw_if(empty($generated_quote), new Exception(api_error(119), 119));

        $external_fees = 0;

        if(isset($generated_quote['transactionDetails']) && isset($generated_quote['transactionDetails']['feeDetails']) && isset($generated_quote['transactionDetails']['feeDetails']['totalFees'])){
            
            $external_fees = $generated_quote['transactionDetails']['feeDetails']['totalFees']['value'];
        }

        $fx_rate = calulate_fx_rate($generated_quote['from']['value'], $generated_quote['to']['value']);

        $expires_at_raw = $generated_quote['expiresAt'] ?? null;

        $expires_at = $expires_at_raw ? \Carbon\Carbon::parse($expires_at_raw)->format('Y-m-d H:i:s.u'): now()->addMinutes(DEFAULT_QUOTE_EXPIRY_MINUTES);

        $quote = $payload + [
            'beneficiary_account_id' => $formatted_payload['beneficiary_id'] ?? null,
            'fx_rate' => $fx_rate,
            'internal_fx_rate' => $fx_rate,
            'external_fx_rate' => $fx_rate,
            'virtual_account_id' => $payload['virtual_account_id'],
            'recipient_country' => $payload['recipient_country'],
            'receiving_currency' => $payload['receiving_currency'],
            'payment_rail' => $payload['payment_rail'],
            'recipient_type' => $payload['recipient_type'],
            'quote_type' => $payload['quote_type'],
            'receiving_amount' => $generated_quote['to']['value'],
            'external_commission_amount' => $external_fees,
            'external_data' => json_encode($generated_quote),
            'external_reference_id' => $generated_quote['id'] ?? null,
            'external_type' => EXTERNAL_TYPE_CALIZA,
            'expires_at' => $expires_at,
        ];

        return $quote;
    }

    public function format_payload($payload, $user)
    {
        $user_service = $user->userServices()->where('service_type', EXTERNAL_TYPE_CALIZA)->first();

        throw_if(!$user_service, new Exception(api_error(113), 113));

        if (!isset($payload['beneficiary_id'])) {

            $beneficiary = BeneficiaryAccount::where('currency', $payload['receiving_currency'])->where('type', $payload['recipient_type'])->where('payment_rail', $payload['payment_rail'])->first();
        } else {

            $beneficiary = $user->beneficiaryAccounts()->where('id', $payload['beneficiary_id'])->first();
        }

        throw_if(!$beneficiary, new Exception(api_error(118), 118));

        $payload = [
            'external_reference_id' => $user_service->external_reference_id,
            'from_amount' => $payload['amount'],
            'from_currency' => CURRENCY_USD,
            'to_currency' => $payload['receiving_currency'],
            'destination' => $beneficiary->external_reference_id,
            'paymentRail' => strtoupper($payload['payment_rail']),
            'beneficiary_id' => $beneficiary->id,
        ];

        return $payload;
    }
}
