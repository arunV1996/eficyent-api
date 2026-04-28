<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class MobileCountryCode extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function scopeSupported()
    {

        return $this->where('status', ACTIVE);
    }

    public function scopeNotSupported()
    {

        return $this->where('status', INACTIVE);
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
