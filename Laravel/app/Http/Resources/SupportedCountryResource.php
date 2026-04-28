<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use App\Models\MobileCountryCode;
use Database\Factories\BeneficiaryAccountLookupFactory;
use Exception;
use Illuminate\Support\Str;
use Illuminate\Http\Resources\Json\JsonResource;
use PHPUnit\TextUI\Help;

class SupportedCountryResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $country = MobileCountryCode::where('alpha_3_code', $this->country_code)->first();

        throw_if(!$country, new Exception(tr('something_went_wrong')));

        $payment_rails = Helper::get_payment_rails();

        return [
            'country_name' => $this->country_name,
            'country_code' => $this->country_code,
            'currencies' => $this->currencies,
            'alpha_2_code' => Str::upper($country->alpha_2_code),
            'flag' => Helper::get_flag($country->alpha_2_code),
            'payment_rails' => $this->country_code == 'USA' ? $payment_rails : [],
        ];
    }
}
