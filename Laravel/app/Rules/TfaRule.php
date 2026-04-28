<?php

namespace App\Rules;

use App\Helpers\Helper;
use Exception;
use Illuminate\Support\Str;
use Illuminate\Contracts\Validation\Rule;

class TfaRule implements Rule
{   
    public $user;
    
    /**
     * Create a new rule instance.
     *
     * @return void
     */
    public function __construct()
    {
        $this->user = request()->user();
    }

    /**
     * Determine if the validation rule passes.
     *
     * @param  string  $attribute
     * @param  mixed  $value
     * @return bool
     */
    public function passes($attribute, $value)
    {
        if (config('app.is_sandbox')) {
         
            return true;
        }
     
        if($this->user->is_tfa_enabled == 1){
            
            if(!$this->user->tfa_secret){
                return false;
            }

           if(!Helper::verifyTfaCode($this->user, $value)){
            
               return false;
           }
        }
        return true;
     
    }   

    /**
     * Get the validation error message.
     *
     * @return string
     */
    public function message()
    {
        return api_error(139);
    }
}
