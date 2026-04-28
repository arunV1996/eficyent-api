<?php

namespace App\Traits;

use Illuminate\Support\Facades\App;

trait IsTeamMember
{
    /**
     * Set the institution_id attribute to the bound value if it exists and the model's attribute is empty.
     *
     * This method is intended to be used as a boot method in a model.
     * It will be called when the model is being created.
     */
    public static function bootIsTeamMember()
    {
        static::creating(function ($model) {

            if (App::bound('team_member_id') && empty($model->team_member_id)) {
                
                $model->team_member_id = App::get('team_member_id');
            }
        });
    }
}
