<?php

namespace App\Contracts\BeneficiaryTransactions;

interface BeneficiaryTransactionContract {

    public function make($user, $quote, $beneficiary_account, $payload);

    public function checkstatus($beneficiary_transaction);

}