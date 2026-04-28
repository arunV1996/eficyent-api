<?php

namespace App\Http\Resources;

use App\Models\BeneficiaryTransaction;
use App\Models\WalletTransaction;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class LedgerResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $transaction = $this->transaction;

        $currency = $this->wallet?->currency ?? $this->virtualAccount?->currency ?? '';

        $fromCurrency = $this->virtualAccount?->currency ?? $currency;

        $amount = $transaction?->total_amount;

        $balance = $this->balance ? $this->balance . ' ' . $currency : '';

        $type = format_transaction_type($this);

        $paid_to = "";

        if($transaction instanceof BeneficiaryTransaction) {
         
            $paid_to = PAID_TO_BENEFICIARY;
        }

        if ($transaction instanceof WalletTransaction) {

            if (!empty($request->wallet_id) || !empty($request->bank_account_id)) {

                $amount = $transaction?->quote?->total_sending_amount;
            }

            if (!empty($request->wallet_id)) {

                $balance = $transaction?->balance_after ? $transaction->balance_after . ' ' . $currency : '';
            }

            if (!empty($request->bank_account_id)) {

                $balance = $this->balance ? $this->balance . ' ' . $fromCurrency : '';
            }

            if($this->virtual_account_id && $this->wallet_id && empty($request->wallet_id)) {
                
                $type = TRANSACTION_TYPE_DEBIT;
            }

            $paid_to = PAID_TO_WALLET;
        }

        $refundtxnId = '';

        if ($this->refund_ledger_id) {

            $refundtxn = $this->refundLedger?->transaction;

            $refundtxnId = $refundtxn?->client_reference_id ?? '';
        }

        return [
            'unique_id'        => $this->unique_id ?? '',
            'transaction_id'  => $transaction?->unique_id ?? '',
            'client_reference_id' => $transaction?->client_reference_id ? $transaction->client_reference_id : ($refundtxnId ?? ''),
            'txn_ref_no'      => $transaction?->txn_ref_no ?? '',
            'transaction_type' => transaction_type_label($type),
            'paid_to'         => $type == TRANSACTION_TYPE_DEBIT ? $paid_to : "",
            'amount'          => $amount ? trim($amount . ' ' . $fromCurrency) : '',
            'balance'         => $balance,
            'refund_transaction_id' => $refundtxnId,
            'created_at'      => $this->created_at ? common_date($this->created_at, $this->user?->timezone ?? DEFAULT_TIMEZONE) : '',
        ];
    }
}
