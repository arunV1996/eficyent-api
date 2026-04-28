<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class SubUserResource extends JsonResource
{

    public function toArray($request)
    {

        return [
            'unique_id' => $this->unique_id,
            'title' => $this->title,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'mobile_country_code' => $this->mobile_country_code,
            'mobile' => $this->mobile,
            'onboarding_step' => onboarding_step_label($this->onboarding_step),
            'id_verification' => id_verification_status_label($this->id_verification),
            'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
        ];
    }
}
