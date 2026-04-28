<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class WalletTransaction extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }

    public function wallet()
    {
        return $this->belongsTo(Wallet::class)->withDefault();
    }

    public function quote()
    {
        return $this->belongsTo(Quote::class)->withDefault();
    }

    public function ledger()
    {
        return $this->morphOne(Ledger::class, 'transaction');
    }
    public function beneficiaryTransaction()
    {
        return $this->belongsTo(BeneficiaryTransaction::class);
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
