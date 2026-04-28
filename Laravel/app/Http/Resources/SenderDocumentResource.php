<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use Illuminate\Http\Resources\Json\JsonResource;


class SenderDocumentResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'document_name' => $this->document_name ?? '',
            'document_type' => $this->document_type ?? '',
            'document_country' => $this->document_country ?? '',
            'document_file' => $this->document_file ? Helper::temporary_s3_url($this->document_file) : '',
            // 'status' => $this->status ?? '',
            // 'verified_at' => $this->verified_at ?? '',
            // 'remarks' => $this->remarks ?? '',
        ];
    }
}
