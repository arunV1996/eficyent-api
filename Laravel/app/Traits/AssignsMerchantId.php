<?php

namespace App\Traits;

use Illuminate\Support\Facades\App;

trait AssignsMerchantId
{
    public static function bootAssignsMerchantId()
    {
        static::creating(function ($model) {

            if (App::bound('merchant_id') && empty($model->merchant_id)) {
            
                $model->merchant_id = App::get('merchant_id');
            }
        });
    }
}
