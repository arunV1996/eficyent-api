<?php

namespace App\ExternalServices\Quotes\Diginine;

use App\Contracts\Quotes\QuoteContract;
use App\Helpers\Helper;
use App\Models\VirtualAccount;
use App\Services\Diginine\QuoteService;
use Exception;
use Illuminate\Support\Facades\Log;

use function Laravel\Prompts\info;

class DiginineQuote implements QuoteContract
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

        if (isset($generated_quote['fee_details']) && count($generated_quote['fee_details']) > 0) {

            foreach ($generated_quote['fee_details'] as $fee) {

                $external_fees += $fee['amount'];
            }
        }

        $fx_rate = 1;

        if (isset($generated_quote['fx_rates']) && count($generated_quote['fx_rates']) > 0) {

            $fx = $generated_quote['fx_rates'][0];

            $fx_rate = $fx['rate'];

            if ($payload['quote_type'] == QUOTE_TYPE_FORWARD) { //TODO - Remove when D9 forward quote works

                $generated_quote['receiving_amount'] = $payload['amount'] * $fx['rate'];
                
            }
        }

        $expires_at_raw = $generated_quote['expires_at'] ?? null;

        $expires_at = $expires_at_raw ? \Carbon\Carbon::parse($expires_at_raw)->format('Y-m-d H:i:s.u') : now()->addMinutes(DEFAULT_QUOTE_EXPIRY_MINUTES);

        if($payload['quote_type'] == QUOTE_TYPE_REVERSE){ //TODO - Remove when D9 forward quote works

            $payload['amount'] = $generated_quote['sending_amount'];
        }
        
        $quote = $payload + [
            'fx_rate' => $fx_rate,
            'external_fx_rate' => $fx_rate,
            'internal_fx_rate' => $fx_rate,
            'virtual_account_id' => $payload['virtual_account_id'],
            'recipient_country' => $payload['recipient_country'],
            'receiving_currency' => $payload['receiving_currency'],
            'recipient_type' => $payload['recipient_type'],
            'quote_type' => $payload['quote_type'],
            'receiving_amount' => $generated_quote['receiving_amount'],
            'external_commission_amount' => $external_fees,
            'external_data' => json_encode($generated_quote),
            'external_reference_id' => $generated_quote['quote_id'] ?? null,
            'external_type' => EXTERNAL_TYPE_DIGININE,
            'expires_at' => $expires_at
        ];

        return $quote;
    }

    public function format_payload($payload, $user)
    {

        // $service_type = Helper::format_payment_type($user->user_type, $payload['recipient_type']);
        $service_type = C2C; //TODO

        $virtual_account = VirtualAccount::where('id', $payload['virtual_account_id'])->first();

        $return_payload = [
            'service_type' => $service_type,
            "sending_country_code" => $virtual_account->country,
            "sending_currency_code" => $virtual_account->currency,
            "receiving_country_code" => get_alpha2_code($payload['recipient_country']),
            "receiving_currency_code" => $payload['receiving_currency'],
            "receiving_mode" => "BANK",
            "type" => DIGININE_TRANSACTION_SEND,
            "instrument" => DIGININE_TRANSACTION_REMITTANCE,
        ];

        //TODO - Remove when D9 forward quote works
        // $payload['quote_type'] = QUOTE_TYPE_REVERSE;

        if ($payload['quote_type'] == QUOTE_TYPE_FORWARD) {

            $quoteservice = new QuoteService();

            $rates_payload = [
                'receiving_currency_code' => $payload['receiving_currency'],
                'receiving_country_code' => get_alpha2_code($payload['recipient_country']),
            ];

            $exchange_rate_response = $quoteservice->getRates($rates_payload);

            $fx_rate = 89.89;

            if (
                isset($exchange_rate_response['success']) &&
                $exchange_rate_response['success'] === true &&
                isset($exchange_rate_response['data']['rates'][0]['rate']) &&
                is_numeric($exchange_rate_response['data']['rates'][0]['rate'])
            ) {
                $fx_rate = (float) $exchange_rate_response['data']['rates'][0]['rate'];
            }

            $exchange_rate = (float) $payload['amount'] * $fx_rate;

            $return_payload['receiving_amount'] = $exchange_rate;

        } else {

            $return_payload['receiving_amount'] = $payload['amount'];
        }

     
        return $return_payload;
    }
}
