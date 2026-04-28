<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class TransactionProofResource extends JsonResource
{

    public function toArray($request)
    {

        return [
            'transaction_id' => $this->beneficiaryTransaction->unique_id,
            'status' => $this->status ? transaction_proof_status_label($this->status) : '',
            'file' => $this->file_url ? Helper::temporary_s3_url($this->file_url) : '',
            'remitter_proof' => $this->remitter_proof ? Helper::temporary_s3_url($this->remitter_proof) : '',
            'requested_at' => $this->requested_at ? common_date($this->requested_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];
    }
}
