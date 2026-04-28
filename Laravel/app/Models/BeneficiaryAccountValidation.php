<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class BeneficiaryAccountValidation extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'external_data' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault();
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
