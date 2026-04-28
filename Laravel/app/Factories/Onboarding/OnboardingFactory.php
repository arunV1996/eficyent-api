<?php

namespace App\Factories\Onboarding;

use App\ExternalServices\Onboarding\Caliza\CalizaOnboarding;
use App\ExternalServices\Onboarding\FvBank\FvBankOnboarding;
use Exception;

class OnboardingFactory
{

    public static function resolve($onboarding_type)
    {

        $onboarding_types = [
            EXTERNAL_TYPE_CALIZA => app(CalizaOnboarding::class),
            EXTERNAL_TYPE_FVBANK => app(FvBankOnboarding::class),
        ];

        throw_if(!isset($onboarding_types[$onboarding_type]), new Exception(api_error(113), 113));

        return $onboarding_types[$onboarding_type];
    }
}
