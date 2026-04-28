<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class UserInformation extends Model
{
    use HasFactory;

    protected $table = 'user_informations';

    protected $guarded = [
        'id'
    ];

    protected $casts = [
        'business_persons' => 'array'
    ];
    
    public function user()
    {
        return $this->belongsTo(User::class);
    }
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
