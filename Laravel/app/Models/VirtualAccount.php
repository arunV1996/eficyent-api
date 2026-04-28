<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use PhpParser\Node\Expr\Cast;

class VirtualAccount extends Model
{
    use HasFactory;

    protected $guarded = [
        'id'
    ];

    protected $casts = [
        'external_data' => 'array'
    ];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault();
    }

    public function quotes()
    {
        return $this->morphMany(Quote::class, 'source');
    }

    public function scopeForUser($query, $user)
    {
        $isMerchant = Merchant::where('user_id', $user->id)->exists();

        if ($user->merchant && ($user->merchant->type == MERCHANT_TYPE_PAYOUT || $user->merchant->type == MERCHANT_TYPE_PAYINCOLLECTION || $user->merchant->type == MERCHANT_TYPE_PAYOUTINTEGRATOR)) {

            $merchant_setting = $user->merchant->settings()->where('key', 'bank_account_id')->first();

            if($merchant_setting) {
                $bank_account_id = $merchant_setting->value;

                return $query->where('id', $bank_account_id);
            }
            return $query->whereNull('user_id');
        }

        return $query->where('user_id', $user->id);
    }


    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
