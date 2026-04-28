<?php

namespace App\Factories\Kyc;

use App\ExternalServices\Kyc\Herald\HeraldSumsubKyc;
use App\ExternalServices\Kyc\Incode\IncodeKyc;
use Exception;

class KycFactory
{

    public static function resolve($kyc_service)
    {

        $kyc_services = [
            ID_VERIFIED_BY_HERALD_SUMSUB => app(HeraldSumsubKyc::class),
            ID_VERIFIED_BY_INCODE => app(IncodeKyc::class),
        ];

        throw_if(!isset($kyc_services[$kyc_service]), new Exception(api_error(113), 113));

        return $kyc_services[$kyc_service];
    }
}
