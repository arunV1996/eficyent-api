<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use App\Models\MobileCountryCode;
use App\Models\SupportedCountry;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class UserWalletResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $countryMap = SupportedCountry::where('currency', $this->currency)->first();

        $country = null;

        if ($countryMap && $countryMap->country_code) {

            $country = MobileCountryCode::where('alpha_3_code',$countryMap->country_code)->first();
        }

        return [
            'unique_id'  => $this->unique_id ?? '',
            'currency'   => $this->currency ?? '',
            'flag'       => $country ? Helper::get_flag($country->alpha_2_code): null,
            'balance'    => Helper::getWalletBalance($this, $this->user),
            'status'     => wallet_status_label($this->status) ?? '',
            'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];
    }
}
