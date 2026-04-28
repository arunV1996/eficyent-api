<?php

namespace App\Contracts\BeneficiaryAccounts;
interface BeneficiaryAccountContract {

    public function create($beneficiary, $user);

}