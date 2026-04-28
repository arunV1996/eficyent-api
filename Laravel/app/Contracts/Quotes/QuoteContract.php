<?php

namespace App\Contracts\Quotes;
interface QuoteContract {

    public function create($payload, $user);

}