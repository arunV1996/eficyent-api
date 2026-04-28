<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class BeneficiaryAccountAdditionalResource extends JsonResource
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
            'recipient_address' => [
                'address_line1' => $this->address_line1 ?? '',
                'address_line2' => $this->address_line2 ?? '',
                'postal_code' => $this->postal_code ?? '',
                'city' => $this->city ?? '',
                'state' => $this->state ? get_state_name($this->state , $this->country ?? null) : '',
                'country' => $this->country ?? '',
            ],
            'bank_address' => [
                'address_line1' => $this->bank_address_line1 ?? '',
                'address_line2' => $this->bank_address_line2 ?? '',
                'postal_code' => $this->bank_postal_code ?? '',
                'city' => $this->bank_city ?? '',
                'state' => $this->bank_state ? get_state_name($this->bank_state , $this->bank_country ?? null) : '',
                'country' => $this->bank_country ?? '',
            ]
        ];

        return filterEmptyValues($data);
    }
}
