<?php

namespace App\Services\Diginine;
use Faker\Factory as Faker;
use Carbon\Carbon;

class Sandbox
{
    public static function generate_quote($payload)
    {
        $faker = Faker::create();

        $now = Carbon::now('UTC');

        $expiresAt = $now->copy()->addSeconds(60);

        $rate = $faker->randomFloat(2, 1, 5);

        $reverseRate = round(1 / $rate, 8);

        $commission = 0.25;

        if (!empty($payload['sending_amount'])) {

            $sendingAmount = floatval($payload['sending_amount']);

            $receivingAmount = round($sendingAmount * $rate, 2);
        } else {

            $receivingAmount = floatval($payload['receiving_amount'] ?? 0);

            $sendingAmount = round($receivingAmount / $rate, 9);
        }

        $totalPayinAmount = round($sendingAmount + $commission, 9);

        return [
            "success" => true,
            "message" => "Quote Generated",
            "code" => 200,
            "data" => [
                "state" => "INITIATED",
                "sub_state" => "QUOTE_CREATED",
                "quote_id" => (string) random_int(7000000000000000, 7999999999999999),
                "created_at" => $now->toIso8601String(),
                "created_at_gmt" => $now->toIso8601String(),
                "expires_at" => $expiresAt->toIso8601String(),
                "expires_at_gmt" => $expiresAt->toIso8601String(),
                "receiving_country_code" => $payload["receiving_country_code"],
                "receiving_currency_code" => $payload["receiving_currency_code"],
                "sending_country_code" => $payload["sending_country_code"],
                "sending_currency_code" => $payload["sending_currency_code"],
                "sending_amount" => $sendingAmount,
                "receiving_amount" => $receivingAmount,
                "total_payin_amount" => $totalPayinAmount,
                "fx_rates" => [
                    [
                        "rate" => $rate,
                        "base_currency_code" => $payload["sending_currency_code"],
                        "counter_currency_code" => $payload["receiving_currency_code"],
                        "type" => "SELL"
                    ],
                    [
                        "rate" => $reverseRate,
                        "base_currency_code" => $payload["receiving_currency_code"],
                        "counter_currency_code" => $payload["sending_currency_code"],
                        "type" => "SELL"
                    ],
                ],
                "fee_details" => [
                    [
                        "type" => "COMMISSION",
                        "model" => "OUR",
                        "currency_code" => $payload["sending_currency_code"],
                        "amount" => $commission,
                        "description" => "Commission"
                    ],
                    [
                        "type" => "TAX",
                        "model" => "OUR",
                        "currency_code" => $payload["sending_currency_code"],
                        "amount" => 0,
                        "description" => "Tax"
                    ]
                ],
                "settlement_details" => [
                    [
                        "charge_type" => "COMMISSION",
                        "value" => 0,
                        "currency_code" => $payload["sending_currency_code"]
                    ],
                    [
                        "charge_type" => "TREASURYMARGIN",
                        "value" => 0,
                        "currency_code" => $payload["sending_currency_code"]
                    ],
                    [
                        "charge_type" => "INPUTTAX",
                        "value" => 0,
                        "currency_code" => $payload["sending_currency_code"]
                    ]
                ],
                "correspondent_rules" => [],
                "price_guarantee" => "FIRM",
                "correspondent_id" => (string) random_int(10000, 19999),
                "correspondent_location_id" => (string) random_int(400000, 499999)
            ]
        ];
    }
    public static function create_transaction($payload)
    {
        $now = Carbon::now('UTC');

        $faker = Faker::create();

        $expiresAt = $now->copy()->addMinutes(30);

        $rate = $faker->randomFloat(2, 1, 5);

        $reverseRate = round(1 / $rate, 8);

        $quoteId = $payload["transaction_quote_id"];

        $sendingCountry = $payload["sending_country_code"];

        $agentTxnRef = $payload["agent_transaction_ref_number"] ?? "Q-" . rand(10000, 99999);

        $sendingAmount = $payload["sending_amount"] ?? 100;

        $receivingAmount = round($sendingAmount * $rate, 0);

        $data = [
            "state" => "ACCEPTED",
            "sub_state" => "ORDER_ACCEPTED",

            "transaction_ref_number" => $quoteId,
            "transaction_date" => $now->toIso8601String(),
            "transaction_gmt_date" => $now->toIso8601String(),

            "expires_at" => $expiresAt->toIso8601String(),
            "expires_at_gmt" => $expiresAt->toIso8601String(),

            "agent_transaction_ref_number" => $agentTxnRef,
            "agent_ref_number" => $quoteId,
            "delivery_ref_number" => $quoteId,

            "receiving_country_code" => $payload["receiver_address_country_code"],
            "receiving_currency_code" => "INR",

            "sending_country_code" => $sendingCountry,
            "sending_currency_code" => "USD",

            "sending_amount" => (float) $sendingAmount,
            "receiving_amount" => (float) $receivingAmount,
            "total_payin_amount" => (float) $sendingAmount,

            "correspondent_id" => (string) random_int(10000, 19999),
            "correspondent_location_id" => (string) random_int(60000000, 69999999),

            "account_category" => "UNDEFINED",
            "transfer_mode" => "IMPS",

            "fx_rates" => [
                [
                    "rate" => $rate,
                    "type" => "SELL",
                    "base_currency_code" => "USD",
                    "counter_currency_code" => "INR"
                ],
                [
                    "rate" => $reverseRate,
                    "type" => "SELL",
                    "base_currency_code" => "INR",
                    "counter_currency_code" => "USD"
                ]
            ],

            "fee_details" => [
                [
                    "type" => "COMMISSION",
                    "model" => "OUR",
                    "amount" => 0,
                    "description" => "Commission",
                    "currency_code" => "USD"
                ],
                [
                    "type" => "TAX",
                    "model" => "OUR",
                    "amount" => 0,
                    "description" => "Tax",
                    "currency_code" => "USD"
                ]
            ],

            "settlement_details" => [
                [
                    "value" => 0,
                    "charge_type" => "COMMISSION",
                    "currency_code" => "USD"
                ],
                [
                    "value" => 0,
                    "charge_type" => "INPUTTAX",
                    "currency_code" => "USD"
                ],
                [
                    "value" => 0,
                    "charge_type" => "TREASURYMARGIN",
                    "currency_code" => "USD"
                ]
            ],

            "price_guarantee" => "FIRM"
        ];

        return [
            'success' => true,
            'message' => tr('success'),
            'code' => 200,
            'data' => $data
        ];
    }


    public static function confirm_transaction($payload)
    {
        $ref = $payload["transaction_ref_number"];

        $data = [
            "transaction_ref_number" => $ref,
            "state" => "IN_PROGRESS",
            "sub_state" => "PAYMENT_SETTLED",
            "agent_transaction_ref_number" => "Q-" . rand(10000, 99999),
            "agent_ref_number" => $ref,
            "delivery_ref_number" => $ref
        ];

        return [
            'success' => true,
            'message' => tr('success'),
            'code' => 200,
            'data' => $data
        ];
    }
}
