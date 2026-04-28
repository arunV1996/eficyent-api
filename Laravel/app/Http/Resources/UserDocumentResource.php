<?php

namespace App\Http\Resources;

use App\Helpers\Helper;
use Illuminate\Http\Resources\Json\JsonResource;


class UserDocumentResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'document_name' => $this->document_name ?? '',
            'document_type' => $this->document_type ?? '',
            'document_country' => $this->document_country ?? '',
            'document_file' => $this->document_file ? Helper::temporary_s3_url($this->document_file) : '',
            'document_back_file' => $this->document_back_file ? Helper::temporary_s3_url($this->document_back_file) : '',
            'document_expiry_date' => $this->document_expiry_date ?? '',
            // 'status' => $this->status ?? '',
            // 'verified_at' => $this->verified_at ?? '',
            // 'remarks' => $this->remarks ?? '',
        ];
    }
}
