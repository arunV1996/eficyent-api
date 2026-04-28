<?php

namespace App\Models;

use App\Traits\IsTeamMember;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class BeneficiaryAccount extends Model
{
    use HasFactory , SoftDeletes , IsTeamMember;

    protected $guarded = ['id'];

    protected $casts = [
        'external_data' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault();
    }

    public function getNameAttribute()
    {
        if($this->type == USER_TYPE_BUSINESS) {

            return $this->business_name ?? "";
        }
        
        $fullName = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));

        return $fullName !== '' ? $fullName : "";
    }

    public function beneficiaryAdditionalDetail() {

        return $this->hasOne(BeneficiaryAdditionalDetail::class)->withDefault();
    }

    public function teamMember()
    {
        return $this->belongsTo(TeamMember::class)->withTrashed();
    }

    public function validation()
    {
        return $this->hasOne(BeneficiaryAccountValidation::class, 'account_number', 'account_number');
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
