<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Crypt;
use Laravel\Sanctum\HasApiTokens;

class Merchant extends Model
{
    use HasFactory, HasApiTokens;

    protected $guarded = ['id'];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }

    public function settings()
    {
        return $this->hasMany(MerchantSetting::class);
    }

    public function fees()
    {
        return $this->morphMany(Fee::class, 'owner');
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
