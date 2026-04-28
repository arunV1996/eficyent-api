<?php

namespace App\Factories\Beneficiary;

use App\ExternalServices\BeneficiaryAccounts\FvBank\FvBankBeneficiaryAccounts;
use App\ExternalServices\BeneficiaryAccounts\Caliza\CalizaBeneficiaryAccounts;

use Exception;

class BeneficiaryFactory
{
    public static function resolve($beneficiary_service)
    {
        $beneficiary_services = [
            EXTERNAL_TYPE_CALIZA => app(CalizaBeneficiaryAccounts::class),
            EXTERNAL_TYPE_FVBANK => app(FvBankBeneficiaryAccounts::class),
        ];

        throw_if(!isset($beneficiary_services[$beneficiary_service]), new Exception(api_error(113), 113));

        return $beneficiary_services[$beneficiary_service];
    }
}
