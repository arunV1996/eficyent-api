<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ExternalServiceCall extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function beneficiaryTransaction()
    {
        return $this->belongsTo(BeneficiaryTransaction::class, 'beneficiary_transaction_id');
    }

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'success' => 'boolean',
    ];
}
