<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class RatesResource extends JsonResource
{

    public function toArray($request)
    {

        return [
            'from_currency' => $this->from,
            'to_currency' => $this->to,
            'fx_rate' => $this->bid
        ];
    }
}
