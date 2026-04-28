<?php

namespace App\Factories\AccountValidation;

use App\ExternalServices\AccountValidation\Surepass\SurepassAccountValidation;
use Exception;

class AccountValidationFactory
{

    public static function resolve($type)
    {

        $services = [
            ID_VERIFIED_BY_SUREPASS => app(SurepassAccountValidation::class),
        ];

        throw_if(!isset($services[$type]), new Exception(api_error(113), 113));

        return $services[$type];
    }
}
