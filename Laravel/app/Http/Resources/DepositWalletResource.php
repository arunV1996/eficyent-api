<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class DepositWalletResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {

        return [
            'unique_id' => $this->unique_id ?? '',
            'wallet_name' => $this->wallet_name ?? '',
            'wallet_address' => $this->wallet_address ?? '',
            'network' => $this->network ?? '',
        ];
    }
}
