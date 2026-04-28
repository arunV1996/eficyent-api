<?php

namespace App\Http\Resources;

use App\Models\Lookup;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class SenderResource extends JsonResource
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
            'unique_id'              => $this->unique_id ?? '',
            'type'                   => user_type_label($this->type) ?? '',
            'first_name'             => $this->first_name ?? '',
            'last_name'              => $this->last_name ?? '',
            'middle_name'            => $this->middle_name ?? '',
            'email'                  => $this->email ?? '',
            'mobile_country_code'    => $this->mobile_country_code ?? '',
            'mobile'                 => $this->mobile ?? '',
            'address'                => $this->address_1 ?? '',
            'country'                => $this->country ?? '',
            'nationality'            => $this->nationality ?? '',
            'city'                   => $this->city ?? '',
            'state'                  => $this->state ? get_state_name($this->state , $this->country ?? null) : '',
            'postal_code'            => $this->postal_code ?? '',
            'source_of_funds' => $this->source_of_funds
                ? (Lookup::where('key', $this->source_of_funds)->value('value') ?? $this->source_of_funds)
                : '',
            'id_type'                => $this->id_type ? Lookup::findValuebyKey($this->id_type, LOOKUP_TYPE_ID_TYPE) : '',
            'id_number'              => $this->id_number ?? '',
            'status'                 => remitter_status_label($this->status) ?? '',
            'created_at'             => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];

        if($this->client_reference_id) {
            
            $data['client_reference_id'] = $this->client_reference_id;
        }
        if($this->dob){

            $data['dob'] = $this->dob;
        }
        if ($this->type == USER_TYPE_BUSINESS) {

            $businessPersons = $this->resource->business_persons ?? [];

            foreach ($businessPersons as $key => $person) {

                if (!empty($person['state'])) {
                
                    $businessPersons[$key]['state'] = get_state_name($person['state'], $person['country']);
                }

                if(!empty($person['id_type'])) {
                
                    $businessPersons[$key]['id_type'] = Lookup::findValuebyKey($person['id_type'], LOOKUP_TYPE_ID_TYPE);
                }

                if(!empty($person['designation'])) {
                    
                    $businessPersons[$key]['designation'] = Lookup::findValuebyKey($person['designation'], LOOKUP_TYPE_PROFESSION);
                }
            }

            $data['business_name'] = $this->first_name ?? '';
            $data['business_persons'] = $businessPersons;

            $data['proofs'] = $this->documents
                ? SenderDocumentResource::collection($this->documents)
                : [];

            unset(
                $data['first_name'],
                $data['last_name'],
                $data['middle_name'],
                $data['title']
            );
        }



        return $data;
    }
}
