<?php

namespace App\Models;

use App\Traits\IsTeamMember;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Sender extends Model
{
    use HasFactory, SoftDeletes , IsTeamMember;

    protected $guarded = ['id'];

    protected $casts = [
        'business_persons' => 'array'
    ];

    public function user()
    {
        return $this->belongsTo(User::class)->withDefault();
    }


    public function getNameAttribute()
    {
        $fullName = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));

        return $fullName !== '' ? $fullName : "";
    }

    public function documents()
    {
        return $this->hasMany(SenderDocument::class);
    }

    public function teamMember()
    {
        return $this->belongsTo(TeamMember::class)->withTrashed();
    }

    public static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            $model->attributes['unique_id'] = Str::uuid();
        });
    }
}
