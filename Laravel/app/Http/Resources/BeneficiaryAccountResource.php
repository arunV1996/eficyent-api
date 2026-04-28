<?php

namespace App\Http\Resources;

use App\Models\Lookup;
use Illuminate\Http\Resources\Json\JsonResource;

class BeneficiaryAccountResource extends JsonResource
{
    public function toArray($request)
    {
        $data = [
            'unique_id'     => $this->unique_id ?? '',
            'country'       => $this->country ?? '',
            'currency'      => $this->currency ?? '',
            'type'          => user_type_label($this->type) ?? '',
            'email'         => $this->email ?? '',
            'mobile_country_code' => $this->mobile_country_code ?? '',
            'mobile'        => $this->mobile ?? '',
            'payment_rail'  => $this->payment_rail ?? '',
            'bank_name'     => $this->bank_name ?? '',
            'routing_number' => $this->routing_number ?? '',
            'account_number' => $this->account_number ?? '',
            'account_type'  => $this->account_type ?? '',
            'swift_code'    => $this->swift_code ?? '',
            'iban'          => $this->iban ?? '',
            'intermediary_bank_swift_code' => $this->intermediary_bank_swift_code ?? '',
            'intermediary_bank_name'       => $this->intermediary_bank_name ?? '',
            'intermediary_bank_aba'        => $this->intermediary_bank_aba ?? '',
            'intermediary_bank_address'    => $this->intermediary_bank_address ?? '',
            'intermediary_bank_city'       => $this->intermediary_bank_city ?? '',
            'intermediary_bank_state'      => $this->intermediary_bank_state ?? '',
            'intermediary_bank_postal_code' => $this->intermediary_bank_postal_code ?? '',
            'intermediary_bank_country'    => $this->intermediary_bank_country ?? '',
            'bank_country'  => $this->bank_country ?? '',
            'user_source_of_income' => $this->beneficiaryAdditionalDetail->user_source_of_income ? Lookup::findValuebyKey($this->beneficiaryAdditionalDetail->user_source_of_income) : '',
            'purpose_of_transaction' => $this->beneficiaryAdditionalDetail->purpose_of_transaction ? Lookup::findValuebyKey($this->beneficiaryAdditionalDetail->purpose_of_transaction) : '',
            'status'        => beneficiary_account_status_label($this->status),
            'additional_details' => new BeneficiaryAccountAdditionalResource($this->beneficiaryAdditionalDetail),
            'created_at'    => $this->created_at
                ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE)
                : '',
        ];

        if ($this->type == USER_TYPE_INDIVIDUAL) {
            $data = array_merge($data, [
                'first_name'   => $this->first_name ?? '',
                'middle_name'  => $this->middle_name ?? '',
                'last_name'    => $this->last_name ?? '',
                'account_name' => $this->account_name
                    ?: trim(($this->first_name . ' ' . $this->last_name)),
            ]);
        }

        if ($this->type == USER_TYPE_BUSINESS) {
            $data = array_merge($data, [
                'business_name'    => $this->business_name ?? '',
                'business_country' => $this->business_country ?? '',
                'account_name'     => $this->account_name ?? '',
            ]);
        }
        $data = filterEmptyValues($data);

        return $data;
    }
}
