<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class QuoteResource extends JsonResource
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
            'sending_amount' => $this->amount ?? '',
            'receiving_amount' => $this->receiving_amount ?? '',
            'fees' => $this->commission_amount + $this->external_commission_amount + $this->merchant_commission_amount,
            'total_amount' => $this->total_sending_amount ?? '',
            'fx_rate' => $this->fx_rate ? format_fx_rate($this) : '',
            'quote_type' => $this->quote_type ?? QUOTE_TYPE_FORWARD,
            'recipient_type' => $this->recipient_type ? user_type_label($this->recipient_type) : USER_TYPE_INDIVIDUAL,
            'recipient_country' => $this->recipient_country ?? '',
            'receiving_currency' => $this->receiving_currency ?? '',
            'payment_rail' => $this->payment_rail ?? '',
            'expires_at' =>  common_date($this->expires_at, $this->user->timezone ?? DEFAULT_TIMEZONE)
        ];
    }
}
