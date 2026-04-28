<?php

namespace App\Contracts\VIrtualAccounts;
interface VirtualAccountContract {

    public function make($user);

    public function get($user);

    public function get_balance($user,$virtual_account);

}