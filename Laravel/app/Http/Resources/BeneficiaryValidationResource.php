<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BeneficiaryValidationResource extends JsonResource
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
            'account_number' => $this->account_number ?? '',
            'ifsc' => $this->code ?? '',
            'is_nre_account' => $this->is_nre_account ? true : false,
        ];

        if($this->account_name) {
            $data['account_name'] = $this->account_name;
        }

        return $data;
    }
}
