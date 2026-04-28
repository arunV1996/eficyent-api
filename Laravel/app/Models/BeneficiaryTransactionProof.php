<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class BeneficiaryTransactionProof extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function beneficiaryTransaction()
    {
        return $this->belongsTo(BeneficiaryTransaction::class);
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
