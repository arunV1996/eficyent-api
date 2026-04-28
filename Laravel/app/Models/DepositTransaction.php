<?php

namespace App\Models;

use App\Traits\IsTeamMember;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class DepositTransaction extends Model
{
    use HasFactory, IsTeamMember;

    protected $guarded = ['id'];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }
    public function virtualAccount()
    {
        return $this->belongsTo(VirtualAccount::class);
    }

    public function ledger()
    {
        return $this->morphOne(Ledger::class, 'transaction');
    }

    public function statusHistories()
    {
        return $this->hasMany(DepositTransactionStatusHistory::class);
    }

    public function adminWallet()
    {
        return $this->belongsTo(AdminWallet::class);
    }
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
