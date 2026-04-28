<?php

namespace App\Contracts\Kyc;

interface KycContract {

    public function make($user);

    public function status($user);

}