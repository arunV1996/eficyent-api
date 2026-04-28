<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Foundation\Auth\User as Authenticatable;

class TeamMember extends Authenticatable
{
    use HasFactory, HasApiTokens, SoftDeletes;

    protected $guarded = ['id'];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }

    public function sender(){

        return $this->belongsTo(Sender::class);
    }

    protected static function booted()
    {
        static::creating(function ($merchant) {

            $merchant->unique_id = Str::uuid();
        });

        static::created(function ($merchant) {

            $api_key = bin2hex(random_bytes(16));

            [$privateKey, $publicKey] = generateRsaKeyPair();

            $merchant->update([
                'api_key' => $api_key,
                'salt_key' => Crypt::encryptString(bin2hex(random_bytes(8))),
                'public_key' => Crypt::encryptString($publicKey),
                'private_key' => Crypt::encryptString($privateKey),
            ]);
        });
    }
}
