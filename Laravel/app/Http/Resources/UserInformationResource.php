<?php

namespace App\Http\Resources;

use App\Models\Lookup;
use Illuminate\Http\Resources\Json\JsonResource;

class UserInformationResource extends JsonResource
{

    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {
        $user_type = $this->user_type;

        switch ($user_type) {
            
            case USER_TYPE_INDIVIDUAL:

                return [
                    'title' => $this->title ?? '',
                    'first_name' => $this->first_name ?? '',
                    'middle_name' => $this->middle_name ?? '',
                    'last_name' => $this->last_name ?? '',
                    'dob' => $this->dob ?? '',
                    'gender' => $this->gender ? gender_formatted($this->gender) : '',
                    'address_line_1' => $this->userInformation?->address_1 ?? '',
                    'address_line_2' => $this->userInformation?->address_2 ?? '',
                    'city' => $this->userInformation?->city ?? '',
                    'state' => $this->userInformation?->state ? get_state_name($this->userInformation?->state , $this->userInformation?->country ?? null) : '',
                    'country' => $this->userInformation?->country ?? '',
                    'postal_code' => $this->userInformation?->postal_code ?? '',
                    'purpose_of_transactions' => $this->userInformation?->purpose_of_transactions ?? '',
                    'id_type' => $this->userInformation?->id_type ?? '',
                    'id_number' => $this->userInformation?->id_number ?? '',
                    'profession' => $this->userInformation?->profession ? Lookup::findValuebyKey($this->userInformation?->profession) : '',
                    'source_of_income' => $this->userInformation?->source_of_income ? Lookup::findValuebyKey($this->userInformation?->source_of_income) : '',
                ];

                break;

            case USER_TYPE_BUSINESS:

                $businessPersons = $this->userInformation->business_persons ?? [];

                foreach ($businessPersons as $key => $person) {

                    if (!empty($person['state'])) {

                        $businessPersons[$key]['state'] = get_state_name($person['state'], $person['country']);
                    }

                    if (!empty($person['id_type'])) {
                        $businessPersons[$key]['id_type'] = Lookup::findValuebyKey($person['id_type'], LOOKUP_TYPE_ID_TYPE);
                    }
                }


                return [
                    'legal_name' => $this->userInformation?->legal_name ?? '',
                    'country_of_incorporation' => $this->userInformation?->country_of_incorporation ?? '',
                    'formation_date' => $this->userInformation?->formation_date ?? '',
                    'business_name' => $this->userInformation?->business_name ?? '',
                    'address_line_1' => $this->userInformation?->address_1 ?? '',
                    'address_line_2' => $this->userInformation?->address_2 ?? '',
                    'city' => $this->userInformation?->city ?? '',
                    'state' => $this->userInformation?->state ? get_state_name($this->userInformation?->state , $this->userInformation?->country ?? null) : '',
                    'country' => $this->userInformation?->country ?? '',
                    'postal_code' => $this->userInformation?->postal_code ?? '',
                    'purpose_of_transactions' => $this->userInformation?->purpose_of_transactions ?? '',
                    'legal_name' => $this->userInformation?->legal_name ?? '',
                    'tax_id' => $this->userInformation?->tax_id ?? '',
                    'formation_date' => $this->userInformation?->formation_date ?? '',
                    'business_name' => $this->userInformation?->business_name ?? '',
                    'website' => $this->userInformation?->website ?? '',
                    'business_persons' => $businessPersons ?? [],
                    'type_of_business' => $this->userInformation?->type_of_business ? Lookup::findValuebyKey($this->userInformation?->type_of_business ) : '',
                ];

                break;

            default:

                return [];
        }
    }
}
