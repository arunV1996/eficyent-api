<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class VirtualAccountResource extends JsonResource
{
    protected $user;

    public function __construct($resource, $user = null)
    {
        parent::__construct($resource);
        $this->user = $user;
    }

    public function toArray($request)
    {
        $user = $request->user();

        $data = [
            'unique_id'              => $this->unique_id ?? '',
            'country'                => $this->country ?? '',
            'currency'               => $this->currency ?? '',
            'account_number'         => $this->account_number ?? '',
            'account_holder_name'    => $this->account_holder_name ?? '',
            'account_holder_address' => $this->account_holder_address ?? '',
            'account_bank_name'      => $this->account_bank_name ?? '',
            'account_bank_code'      => $this->account_bank_code ?? '',
            'account_bank_address'   => $this->account_bank_address ?? '',
            'routing_number'         => $this->routing_number ?? '',
            'flag'                   => Helper::get_flag($this->country),
            'status'                 => virtual_account_status_label($this->status) ?? '',
            'created_at'             => $this->created_at
                ? common_date(
                    $this->created_at,
                    $this->user->timezone ?? DEFAULT_TIMEZONE
                )
                : '',
        ];

        if (isset($this->balance)) {
            $data['balance'] = $this->balance;
        }

        if ($user) {

            $data['memo'] = $user->memo;
        }

        if(isset($this->swift)){
            
            $data['swift_account'] = $this->swift ? new VirtualAccountResource($this->swift) : null;
        }

        return $data;
    }
}
