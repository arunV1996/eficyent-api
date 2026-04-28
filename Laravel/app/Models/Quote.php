<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;

class Quote extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }

    public function beneficiary()
    {
        return $this->belongsTo(BeneficiaryAccount::class)->withDefault()->withTrashed();
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function virtualAccount(): MorphTo
    {
        return $this->morphTo(__FUNCTION__, 'source_type', 'source_id');
    }

    public function isVirtualAccountQuote(): bool
    {
        return $this->source_type === VirtualAccount::class;
    }

    public function isWalletQuote(): bool
    {
        return $this->source_type === Wallet::class;
    }
    public function wallet_transactions()
    {
        return $this->hasMany(WalletTransaction::class);
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
