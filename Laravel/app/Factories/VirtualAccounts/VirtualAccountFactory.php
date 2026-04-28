<?php

namespace App\Factories\VirtualAccounts;

use App\ExternalServices\VirtualAccounts\FvBank\FvBankVirtualAccounts;

use App\ExternalServices\VirtualAccounts\Caliza\CalizaVirtualAccounts;

use Exception;


class VirtualAccountFactory

{
    public static function resolve($va_service)
    {
        $va_services = [
            EXTERNAL_TYPE_CALIZA => app(CalizaVirtualAccounts::class),
            EXTERNAL_TYPE_FVBANK => app(FvBankVirtualAccounts::class),
        ];

        throw_if(!isset($va_services[$va_service]), new Exception(api_error(113), 113));

        return $va_services[$va_service];
    }
}
