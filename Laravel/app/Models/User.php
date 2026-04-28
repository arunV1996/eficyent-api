<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;

use App\Casts\EncryptDecryptCast;
use App\Traits\AssignsMerchantId;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Crypt;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes , AssignsMerchantId;


    protected $guarded = [
        'id'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'password' => 'hashed',
        'service_providers' => 'array',
        'backup_codes' => EncryptDecryptCast::class,
        'id_verification_data' => 'array'
    ];

    public function getNameAttribute()
    {
        if ($this->user_type == 2 && $this->userInformation) {
            return $this->userInformation->business_name ?? "";
        }

        $fullName = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));

        return $fullName !== '' ? $fullName : "";
    }

    public function userInformation()
    {
        return $this->hasOne(UserInformation::class);
    }

    public function userDocuments()
    {
        return $this->hasMany(UserDocument::class);
    }

    public function userServices()
    {
        return $this->hasMany(UserService::class);
    }

    public function virtualAccounts()
    {
        return $this->hasMany(VirtualAccount::class);
    }

    public function beneficiaryAccounts()
    {
        return $this->hasMany(BeneficiaryAccount::class);
    }

    public function senders()
    {
        return $this->hasMany(Sender::class);
    }

    public function beneficiary_transactions()
    {
        return $this->hasMany(BeneficiaryTransaction::class);
    }

    public function merchant()
    {
        return $this->belongsTo(Merchant::class);
    }

    public function teamMembers()
    {
        return $this->hasMany(TeamMember::class);
    }

    public function wallets()
    {
        return $this->hasMany(Wallet::class);
    }

    public function wallet_transactions()
    {
        return $this->hasMany(WalletTransaction::class);
    }

    public function fees()
    {
        return $this->morphMany(Fee::class, 'owner');
    }

    public function userSettings()
    {
        return $this->hasMany(UserSetting::class);
    }

    protected static function booted()
    {
        static::creating(function ($user) {

            $user->unique_id = Str::uuid();
        });

        static::created(function ($user) {

            $api_key = $user->createToken(EXTERNAL_API_TOKEN, [ENCRYPTION_ABILITY])->plainTextToken;

            [$privateKey, $publicKey] = generateRsaKeyPair();

            $user->update([
                'api_key' => $api_key,
                'salt_key' => Crypt::encryptString(bin2hex(random_bytes(8))),
                'public_key' => Crypt::encryptString($publicKey),
                'private_key' => Crypt::encryptString($privateKey),
            ]);
        });
    }
}
