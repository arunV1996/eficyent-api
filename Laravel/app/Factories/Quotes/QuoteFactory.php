<?php

namespace App\Factories\Quotes;

use App\ExternalServices\Quotes\Caliza\CalizaQuote;
use App\ExternalServices\Quotes\Diginine\DiginineQuote;
use App\ExternalServices\Quotes\Massive\MassiveQuote;
use Exception;

class QuoteFactory
{

    public static function resolve($va_service)
    {

        $va_services = [
            EXTERNAL_TYPE_CALIZA => app(CalizaQuote::class),
            EXTERNAL_TYPE_DIGININE => app(DiginineQuote::class),
            EXTERNAL_TYPE_MASSIVE => app(MassiveQuote::class),
        ];

        throw_if(!isset($va_services[$va_service]), new Exception(api_error(113), 113));

        return $va_services[$va_service];
    }
}
