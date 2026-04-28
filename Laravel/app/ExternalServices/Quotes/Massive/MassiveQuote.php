<?php

namespace App\ExternalServices\Quotes\Massive;

use App\Contracts\Quotes\QuoteContract;
use App\Helpers\Helper;
use App\Models\VirtualAccount;
use App\Services\Massive\QuoteService;
use Exception;

class MassiveQuote implements QuoteContract
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

        $fx_rate = 1;

        if (isset($generated_quote['last']) && count($generated_quote['last']) > 0) {

            $fx = $generated_quote['last']['bid'];

            $fx_rate = $fx;
        }

        $expires_at = now()->addMinutes(DEFAULT_QUOTE_EXPIRY_MINUTES);

        if($payload['quote_type'] == QUOTE_TYPE_REVERSE){

            $receiving_amount = $payload['amount'];

            $payload['amount'] = $payload['amount'] / $fx_rate;

        }else{

            $receiving_amount = $generated_quote['converted'] * $payload['amount'];
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
            'receiving_amount' => $receiving_amount,
            'external_commission_amount' => $external_fees,
            'external_data' => json_encode($generated_quote),
            'external_reference_id' => $generated_quote['request_id'] ?? null,
            'external_type' => EXTERNAL_TYPE_MASSIVE,
            'expires_at' => $expires_at
        ];

        return $quote;
    }

    public function format_payload($payload, $user)
    {

        $virtual_account = VirtualAccount::where('id', $payload['virtual_account_id'])->first();

        throw_if(!$virtual_account, new Exception(api_error(120), 120));

        if($virtual_account->currency != "USD"){
            
            $virtual_account->currency = "USD";
        }

        $return_payload = [
            'amount' => $payload['amount'],
            'from_currency' => $virtual_account->currency,
            'to_currency' => $payload['receiving_currency'],
        ];

        return $return_payload;
    }

    public function rates($payload, $user)
    {

        $payload['from_currency'] = "USD";
        
        $quoteservice = new QuoteService();

        $response = $quoteservice->create($payload);

        if($response['success']){

            $data = $response['data'];

            return [
                'from_currency' => $data['from'],
                'to_currency' => $data['to'],
                'fx_rate' => $data['last']['bid'], 
            ];
        }
    }
}
