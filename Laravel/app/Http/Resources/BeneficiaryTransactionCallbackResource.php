<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use App\Models\Lookup;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use stdClass;

class BeneficiaryTransactionCallbackResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $data = [
            'unique_id' => $this->unique_id ?? '',
            'txn_ref_no' => $this->txn_ref_no ?? '',
            'client_reference_id' => $this->client_reference_id ?? '',
            'utr_number' => $this->external_reference_id ?? '',
            'total_amount' => $this->total_amount ?? '',
            'status' => beneficiary_transaction_status_label($this->status) ?? '',
            'remarks' => $this->notes ?? '',
        ];

        return $data;
    }
}
