<?php

namespace App\Factories\Quotes;

use App\ExternalServices\Quotes\Caliza\CalizaQuote;
use App\ExternalServices\Quotes\Diginine\DiginineQuote;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use Exception;

class QuoteSourceFactory
{

    public static function resolve(string $sourceType, string $sourceId, $user)
    {
        $source = match ($sourceType) {
            VirtualAccount::class => VirtualAccount::where('id', $sourceId)
                ->first(),

            Wallet::class => Wallet::where('user_id', $user->id)
                ->where('id', $sourceId)
                ->first(),

            default => null,
        };

        throw_if(!$source, new Exception("Invalid source: {$sourceType}", 120));

        return $source;
    }
}
