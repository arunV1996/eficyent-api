<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class SupportedCountry extends Model
{
    use HasFactory;
    
    protected $guarded = ['id'];

    protected $hidden = ['created_at', 'updated_at'];

    public function scopeSupported()
    {

        return $this->where('status', ACTIVE);
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
