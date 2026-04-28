<?php

namespace App\Actions\DepositTransaction;

use Exception;
use App\Models\DepositTransaction;
use App\Services\Report\Deposit;

class SendDepositNotification
{
    public static function execute(DepositTransaction $transaction): void
    {
        try {

            throw_if($transaction->status != DEPOSIT_TRANSACTION_COMPLETED, new Exception(tr('transaction_not_eligible_for_deposit_request')));

            $merchant_id = $transaction->user->merchant->unique_id ?? '--';

            $deposit_reponse = (new Deposit)->deposit([
                'reference_id' => ($transaction->external_reference_id ?: $transaction->unique_id) ?: NULL,
                'merchant_id' => $merchant_id ?: NULL,
                'currency' => $transaction->virtualAccount->currency ?? NULL,
                'amount' => $transaction->total_amount ?: 0,
                'remarks' => $transaction->remarks ?: '--',
            ]);

            throw_if(! $deposit_reponse['success'], new Exception($deposit_reponse['message']));

            info("SendDepositNotification Success: ($transaction->unique_id) " . $deposit_reponse['message']);
            
        } catch (Exception $e) {

            info("SendDepositNotification Error: ($transaction->unique_id) " . $e->getMessage());
        }
    }
}
