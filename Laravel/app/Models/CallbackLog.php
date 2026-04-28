<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CallbackLog extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'logs' => 'array',
    ];
}
