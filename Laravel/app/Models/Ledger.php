<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Ledger extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    public function transaction()
    {
        return $this->morphTo();
    }
    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }
    public function virtualAccount()
    {
        return $this->belongsTo(VirtualAccount::class);
    }

    public function wallet()
    {
        return $this->belongsTo(Wallet::class);
    }

    public function refundLedger()
    {
        return $this->belongsTo(Ledger::class, 'refund_ledger_id');
    }
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
