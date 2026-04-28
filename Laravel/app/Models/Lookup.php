<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Lookup extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public static function findValuebyKey($key , $type = null)
    {
        $base_query = Lookup::where('key', $key);

        if ($type) {
            $base_query->where('type', $type);
        }

        $lookup = $base_query->first();
        
        return $lookup ? $lookup->value : $key;
    }
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
