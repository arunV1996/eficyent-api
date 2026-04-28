<?php

namespace App\Models;

use App\Traits\IsTeamMember;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class BeneficiaryTransaction extends Model
{
    use HasFactory , IsTeamMember;

    protected $guarded = ['id'];

    protected $casts = [
        
        'compliance_data' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault()->withTrashed();
    }

    public function quote()
    {
        return $this->belongsTo(Quote::class)->withDefault();
    }

    public function beneficiaryAccount()
    {
        return $this->belongsTo(BeneficiaryAccount::class)->withDefault()->withTrashed();
    }

    public function sender()
    {
        return $this->belongsTo(Sender::class)->withTrashed();
    }

    public function ledger()
    {
        return $this->morphOne(Ledger::class, 'transaction');
    }

    public function teamMember()
    {
        return $this->belongsTo(TeamMember::class)->withTrashed();
    }

    public function walletTransaction()
    {
        return $this->belongsTo(WalletTransaction::class);
    }

    public function statusHistories()
    {
        return $this->hasMany(BeneficiaryTransactionStatusHistory::class);
    }

    public function proof()
    {
        return $this->hasOne(BeneficiaryTransactionProof::class);
    }

    public function loggable()
    {
        return $this->morphMany(CallbackLog::class, 'loggable');
    }
    
    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();

            $model->attributes['order_id'] = generateOrderID();
        });
    }
}
