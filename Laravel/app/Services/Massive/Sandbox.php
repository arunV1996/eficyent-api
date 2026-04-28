<?php

namespace App\Services\Massive;

use Carbon\Carbon;
use Illuminate\Support\Str;

class Sandbox
{
    public static function generate_quote(array $payload): array
    {
        $now = Carbon::now('UTC');

        $from = $payload['from_currency'] ?? 'USD';
        $to   = $payload['to_currency'] ?? 'EUR';

        $symbol = "{$from}/{$to}";

        $baseRates = self::baseRates();

        if (!isset($baseRates[$symbol])) {
            
            $baseRates[$symbol] = 1;
        }

        $mid = $baseRates[$symbol];

        $amount = $payload['amount'] ?? 1;

        $converted = round($amount * $mid, 2);

        return [
            'success' => true,
            'data' => [
                'data' => [
                    'converted'     => $converted,
                    'from'          => $from,
                    'to'            => $to,
                    'initialAmount' => $amount,
                    'symbol'        => $symbol,
                    'status'        => 'success',
                    'request_id'    => Str::uuid()->toString(),
                    'last' => [
                        'bid'       => $mid,
                        'ask'       => $mid,
                        'exchange'  => 48,
                        'timestamp' => $now->getTimestampMs(),
                    ],
                ],
                'api_status' => 200,
            ],
            'message' => 'Exchange rate fetched successfully (sandbox)',
            'code'    => 3143,
        ];
    }

    private static function baseRates(): array
    {
        $rates = [
            'USD/EUR' => 0.85,
            'USD/INR' => 91.788,
            'USD/GBP' => 0.78,
            'USD/SGD' => 1.35,
            'USD/AED' => 3.6725,
            'USD/LKR' => 309.42,
            'USD/NPR' => 146.85,
            'USD/PKR' => 278.15,
            'USD/BDT' => 122.03,
            'USD/PHP' => 58.65,
            'USD/HTG' => 130.56,
            'USD/CNY' => 6.94
        ];

        return $rates;
    }
}
