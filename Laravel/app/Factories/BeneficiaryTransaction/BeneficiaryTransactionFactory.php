<?php

namespace App\Factories\BeneficiaryTransaction;

use Exception;
use App\ExternalServices\BeneficiaryTransactions\Caliza\CalizaBeneficiaryTransaction;
use App\ExternalServices\BeneficiaryTransactions\ViyonaPay\ViyonaBeneficiaryTransaction;
use App\ExternalServices\BeneficiaryTransactions\Diginine\DiginineBeneficiaryTransaction;

class BeneficiaryTransactionFactory
{
    public static function resolve($beneficiary_service)
    {
        $beneficiary_services = [
            EXTERNAL_TYPE_CALIZA => app(CalizaBeneficiaryTransaction::class),
            EXTERNAL_TYPE_DIGININE => app(DiginineBeneficiaryTransaction::class),
            EXTERNAL_TYPE_VIYONA_PAY => app(ViyonaBeneficiaryTransaction::class),
        ];

        throw_if(!isset($beneficiary_services[$beneficiary_service]), new Exception(api_error(113), 113));

        return $beneficiary_services[$beneficiary_service];
    }
}
