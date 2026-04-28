<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use App\Models\Lookup;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use stdClass;

class BeneficiaryTransactionResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $method = $request->get('resource_method') ?? LIST_RESPONSE;

        switch ($method) {

            case CALLBACK_RESPONSE:

                return [
                    'unique_id' => $this->unique_id ?? '',
                    'txn_ref_no' => $this->txn_ref_no ?? '',
                    'utr_number' => $this->external_reference_id ?? '',
                    'total_amount' => $this->total_amount ?? '',
                    'status' => beneficiary_transaction_status_label($this->status) ?? '',
                ];

            case LIST_RESPONSE:

                $data = [
                    'unique_id' => $this->unique_id ?? '',
                    'txn_ref_no' => $this->txn_ref_no ?? '',
                    'utr_number' => $this->external_reference_id ?? '',
                    'beneficiary_account' => $this->beneficiaryAccount ? new BeneficiaryAccountResource($this->beneficiaryAccount) : new stdClass(),
                    'quote' => $this->quote ? new QuoteResource($this->quote) : new stdClass(),
                    'amount' => $this->amount ?? '',
                    'commission_amount' => $this->commission_amount ?? '',
                    'total_amount' => $this->total_amount ?? '',
                    'sending_currency' => $this->quote->source->currency ?? '',
                    'recipient_amount' => $this->recipient_amount ?? '',
                    'receiving_currency' => $this->receiving_currency ?? '',
                    'remarks' => $this->remarks ?? '',
                    'notes' => $this->notes ?? '',
                    'supporting_document' => $this->supporting_document ? Helper::temporary_s3_url($this->supporting_document) : '',
                    'status' => beneficiary_transaction_status_label($this->status) ?? '',
                    'created_by' => $this->team_member_id ? ($this->teamMember->unique_id ?? '') : ($this->user->unique_id ?? ''),
                    'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
                ];

                if (isset($this->sender)) {

                    $data['remitter'] = new SenderResource($this->sender);
                }

                if (isset($this->client_reference_id)) {

                    $data['client_reference_id'] = $this->client_reference_id;
                }

                if(isset($this->purpose_of_payment) && !empty($this->purpose_of_payment)) {
                    
                    $data['purpose_of_payment'] = Lookup::findValuebyKey($this->purpose_of_payment, LOOKUP_TYPE_EEC_PAYMENT_PURPOSE);
                }

                if($this->proof){

                    $data['transaction_proof'] = new TransactionProofResource($this->proof);
                }

                return $data;

            default:
                return [];
        }
    }
}
