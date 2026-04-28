<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class PayoutJob extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'payload' => 'array'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

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
