<?php

namespace App\Repositories;

use App\Factories\Quotes\QuoteFactory;
use App\Factories\Quotes\QuoteSourceFactory;
use App\Helpers\CommissionsHelper;
use App\Models\Quote;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use Exception;
use Illuminate\Support\Facades\DB;

class QuoteRepository
{
    public function store(array $validated, $user, QuoteFactory $quoteFactory)
    {

        $source = QuoteSourceFactory::resolve($validated['source_type'], $validated['source_id'], $user);

        throw_if(!$source, new Exception(api_error(120), 120));

        if ($source instanceof VirtualAccount) {

            if ($source->currency == $validated['receiving_currency']) {

                $response = $validated + [
                    'total_sending_amount' => $validated['amount'],
                    'fx_rate' => 1,
                    'external_fx_rate' => 1,
                    'recipient_country' => $validated['recipient_country'],
                    'receiving_currency' => $validated['receiving_currency'],
                    'recipient_type' => $validated['recipient_type'],
                    'quote_type' => $validated['quote_type'],
                    'receiving_amount' => $validated['amount'],
                    'source_type' => $source->getMorphClass(),
                    'source_id' => $source->id
                ];

                $fee_payload = [
                    'amount' => $validated['amount'],
                    'receiving_currency' => $validated['receiving_currency'],
                    'payment_rail' => $validated['payment_rail'] ?? null
                ];

                $transaction_fee = CommissionsHelper::calc_transaction_commissions($fee_payload, $user);

                $response = array_merge($response, $transaction_fee);

                $total_sending_amount = $response['amount']  + $response['commission_amount'] + $response['merchant_commission_amount'];

            } else {
                $validated['virtual_account_id'] = $source->id;

                $validated['external_type'] = EXTERNAL_TYPE_MASSIVE;

                $quoteDriver = $quoteFactory->resolve($validated['external_type']);

                $response = $quoteDriver->create($validated, $user);

                if($source->currency == "AED"){

                    $aedToInrRate = $response['fx_rate'] / env('USD_TO_AED' , 2.67);

                    $response['fx_rate'] = round($aedToInrRate, 6);

                    $response['external_fx_rate'] = round($aedToInrRate, 6);

                    $response['internal_fx_rate'] = round($aedToInrRate, 6);

                    if($response['quote_type'] == QUOTE_TYPE_REVERSE){
                        
                        $response['amount'] = round($response['receiving_amount'] * $response['fx_rate'], 6);
                    }else{

                        $response['receiving_amount'] = round($response['amount'] / $response['fx_rate'], 6);
                    }
                }

                if (isset($validated['quote_mode']) && $validated['quote_mode'] == QUOTE_MODE_QUOTATION) {

                    $response = array_merge(
                        $response,
                        CommissionsHelper::calc_fx_commissions($response, $user),
                        CommissionsHelper::calc_transaction_commissions($response, $user)
                    );

                    $total_sending_amount = $response['amount'] + $response['external_commission_amount'] + $response['commission_amount'] + $response['merchant_commission_amount'];
                } else {

                    $response = array_merge(
                        $response,
                        CommissionsHelper::calc_fx_commissions($response, $user)
                    );

                    $total_sending_amount = $response['amount'];

                    $response['external_commission_amount'] = 0;
                }

                $response = array_merge($response, [
                    'total_sending_amount' => $total_sending_amount
                ]);
            }
        } else {

            throw_if($source->currency != $validated['receiving_currency'], new Exception(api_error(172), 172));

            throw_if($source->status != WALLET_STATUS_ACTIVE, new Exception(api_error(169), 169));

            $response = $validated + [
                'total_sending_amount' => $validated['amount'],
                'fx_rate' => 1,
                'external_fx_rate' => 1,
                'recipient_country' => $validated['recipient_country'],
                'receiving_currency' => $validated['receiving_currency'],
                'recipient_type' => $validated['recipient_type'],
                'quote_type' => $validated['quote_type'],
                'receiving_amount' => $validated['amount'],
                'source_type' => $source->getMorphClass(),
                'source_id' => $source->id
            ];
        }

        
        $quote = DB::transaction(function () use ($response, $user) {

            $response['user_id'] = $user->id;

            $quote = Quote::create($response);

            throw_if(!$quote, new Exception(api_error(119), 119));

            return $quote->refresh();
        });

        return $quote;
    }
}
