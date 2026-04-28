<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;
use stdClass;

class StaticPageResource extends JsonResource
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
            'title' => $this->title ? ucfirst($this->title) : '',
            'type' => $this->type ?? '',
            'content' => $this->description ?? '',
            'status' => $this->status ?? '',
            'created_at' => $this->created_at ? common_date($this->created_at, $this->user->timezone ?? DEFAULT_TIMEZONE) : '',
        ];
    }
}
