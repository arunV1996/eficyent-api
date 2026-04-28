<?php

namespace App\Actions\BeneficiaryTransaction;

use Exception;
use App\Services\Report\Debit;
use App\Models\BeneficiaryTransaction;

class SendDebitNotification
{
    public static function execute(BeneficiaryTransaction $transaction): void
    {
        try {

            throw_if($transaction->status != BENEFICIARY_TRANSACTION_COMPLETED, new Exception(tr('transaction_not_eligible_for_debit_request')));

            $payload = self::generate_payload($transaction);

            $debit_reponse = (new Debit)->debit($payload);

            throw_if(! $debit_reponse['success'], new Exception($debit_reponse['message']));

            info("SendDebitNotification Success: ($transaction->unique_id) " . $debit_reponse['message']);
            
        } catch (Exception $e) {

            info("SendDebitNotification Error: ($transaction->unique_id) " . $e->getMessage());
        }
    }

    private static function generate_payload(BeneficiaryTransaction $transaction): array
    {
        return match($transaction->external_type) {
            EXTERNAL_TYPE_VIYONA_PAY => self::generate_vp_payload($transaction),
            EXTERNAL_TYPE_DIGININE => self::generate_d9_payload($transaction),
            default => self::generate_vp_payload($transaction)
        };
    }

    private static function generate_vp_payload(BeneficiaryTransaction $transaction): array
    {
        $merchant_id = $transaction->user->merchant->unique_id ?? NULL;

        $source_currency = $transaction->quote?->source?->currency ?? NULL;

        throw_if(empty($source_currency), new Exception(tr('vp_transaction_source_currency_not_found')));

        return [
            'reference_id' => $transaction->external_reference_id ?: NULL,
            'merchant_id' => $merchant_id ?: NULL,
            'mid_id' => self::get_mid_id($transaction),
            'source_currency' => $source_currency,
            'source_amount' => $transaction->amount ?: 0,
            'destination_currency' => $transaction->receiving_currency ?: '--',
            'destination_amount' => $transaction->recipient_amount ?: 0,
            'mid_wallet' => [
                'currency' => 'INR',
                'debit_amount' => $transaction->recipient_amount ?: 0,
                'fees' => self::calculate_vp_fees($transaction)
            ],
            'merchant_wallet' => [
                'currency' => $source_currency,
                'debit_amount' => $transaction->amount ?: 0,
                'fees' => $transaction->commission_amount ?? 0
            ],
            'exchange_rate' => $transaction->quote?->fx_rate ?: '--',
            'remarks' => $transaction->remarks ?: '--',
            'transaction_date' => $transaction->created_at->format('Y-m-d')
        ];
    }

    private static function generate_d9_payload(BeneficiaryTransaction $transaction): array
    {
        $merchant_id = $transaction->user->merchant->unique_id ?? NULL;

        $base_source_currency = $transaction->quote?->source?->currency ?? NULL;

        throw_if(empty($base_source_currency), new Exception(tr('d9_transaction_source_currency_not_found')));

        $exchange_rate = $transaction->quote?->fx_rate ?: '--';

        $external_data = json_decode(($transaction->external_data ?: ''), true);

        [$source_currency, $destination_currency] = [
            $external_data['transaction']['sending_currency_code'] ?? NULL,
            $external_data['transaction']['receiving_currency_code'] ?? NULL
        ];

        throw_if(empty($source_currency), new Exception(tr('d9_transaction_source_currency_not_found')));

        throw_if(empty($destination_currency), new Exception(tr('d9_transaction_destination_currency_not_found')));

        $source_amount = $mid_debit_amount = $merchant_wallet_debit_amount = $external_data['transaction']['sending_amount'] ?? 0;

        $fees = $mid_wallet_fees = collect($external_data['transaction']['fee_details'] ?? [])->sum('amount');

        $destination_amount = $external_data['transaction']['receiving_amount'] ?? (($transaction->recipient_amount));

        $mid_wallet_currency = $source_currency;

        $merchant_wallet_currency = $base_source_currency;

        $service_exchange_rate = collect($external_data['transaction']['fx_rates'])->where('base_currency_code', $source_currency)->first()->rate ?? NULL;
        
        if($base_source_currency == 'AED') {

            $merchant_wallet_currency = $source_currency = $base_source_currency;

            $source_amount = $merchant_wallet_debit_amount = $transaction->amount ?: 0;

            $fees = $transaction->commission_amount ?: 0;
        }

        return [
            'reference_id' => $transaction->external_reference_id ?: NULL,
            'merchant_id' => $merchant_id ?: NULL,
            'mid_id' => self::get_mid_id($transaction),
            'source_currency' => $source_currency,
            'source_amount' => $source_amount ?: 0,
            'destination_currency' => $destination_currency,
            'destination_amount' => $destination_amount ?: 0,
            'mid_wallet' => [
                'currency' => $mid_wallet_currency,
                'debit_amount' => $mid_debit_amount ?: 0,
                'fees' => $mid_wallet_fees
            ],
            'merchant_wallet' => [
                'currency' => $merchant_wallet_currency,
                'debit_amount' => $merchant_wallet_debit_amount ?: 0,
                'fees' => $fees ?: 0
            ],
            'exchange_rate' => $exchange_rate,
            'service_exchange_rate' => $service_exchange_rate,
            'remarks' => $transaction->remarks ?: '--',
            'transaction_date' => $transaction->created_at->format('Y-m-d H:i:s')
        ];
    }

    private static function get_mid_id(BeneficiaryTransaction $transaction): string
    {
        return match ($transaction->external_type) {
            EXTERNAL_TYPE_VIYONA_PAY => config('services.mid_accounts.viyonapay'),
            EXTERNAL_TYPE_DIGININE => config('services.mid_accounts.diginine'),
            default => '--'
        } ?: '--';
    }

    private static function calculate_vp_fees(BeneficiaryTransaction $transaction): float
    {
        return match($transaction->rail) {
            "IMPS" => 5.9,
            "NEFT" => 0,
            "RTGS" => 0
        };
    }
}
