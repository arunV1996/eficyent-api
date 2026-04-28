<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;

class Fee extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'fee_type'  => 'integer',
        'status'    => 'integer',
    ];

    public function owner(): MorphTo
    {
        return $this->morphTo();
    }
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
