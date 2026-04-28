<?php

namespace App\Http\Resources;

use App\Models\Merchant;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class TeamMemberResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {

        $merchant = $this->user->merchant ?? null;

        return [
            'unique_id' => $this->unique_id ?? '',
            'name' => $this->name ?? '',
            'email' => $this->email ?? '',
            'role' => user_role_label($this->role) ?? '',
            'permission' => user_permission_label($this->permission) ?? '',
            'sender_enabled' => $this->role == TEAM_MEMBER_ROLE_CORPORATE ? sender_status_label(0) : sender_status_label($this->user->enable_sender),
            'is_merchant' => $merchant ? "YES" : "NO",
            'status' => team_member_status_label($this->status) ?? '',
            'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];
    }
}
