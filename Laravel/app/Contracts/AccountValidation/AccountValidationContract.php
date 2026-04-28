<?php

namespace App\Contracts\AccountValidation;
interface AccountValidationContract {

    public function validate($payload, $user);

}