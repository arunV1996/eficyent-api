<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use stdClass;

class DepositTransactionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {

        $sourceFunds = deposit_source_of_fund();
        
        $purposes = deposit_purpose();

        $data = [
            'unique_id' => $this->unique_id ?? '',
            'memo' => $this->memo ?? '',
            'amount' => $this->amount ?? '',
            'fee' => $this->total_commission_amount . ' ' . $this->virtualAccount->currency ?? '',
            'total_amount' => $this->total_amount ?? '',
            'currency' => $this->virtualAccount->currency ?? '',
            'type' => ucfirst($this->type ?? ''),
            'purpose_of_payment' => $purposes[$this->purpose_of_payment] ?? '',
            'source_of_funds' => $sourceFunds[$this->source_of_funds] ?? '',
            'status' => deposit_transaction_status_label($this->status) ?? '',
            'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];

        if($this->proof){

            $data['proof'] = $this->proof ? Helper::temporary_s3_url($this->proof) : '';
        }

        if($this->client_reference_id) {
            
            $data['client_reference_id'] = $this->client_reference_id;
        }

        if($this->ledger && $this->ledger->refundLedger && $this->ledger->refundLedger->transaction) {
            
            $data['refund_transaction'] = [
                'unique_id' => $this->ledger->refundLedger->transaction->unique_id ?? '',
                'txn_ref_no' => $this->ledger->refundLedger->transaction->txn_ref_no ?? '',
            ];
        }

        if($this->remarks){

            $data['remarks'] = $this->remarks;
        }


        $data['deposit_currency'] = $this->deposit_currency ? $this->deposit_currency : $this->virtualAccount->currency ?? '';

        if($this->from_wallet_address) {

            $data['from_wallet_address'] = $this->from_wallet_address;
        }

        if($this->adminWallet) {

            $data['to_wallet'] = $this->adminWallet ? $this->adminWallet->wallet_address : '';
        }
        if($this->transaction_hash) {
            $data['transaction_hash'] = $this->transaction_hash;
        }
        return $data;
    }
}
