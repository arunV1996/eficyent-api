<?php

namespace App\Services\Surepass;

use Faker\Factory as Faker;
use Carbon\Carbon;

class Sandbox
{
    public static function validate(array $payload): array
    {
        $faker = Faker::create('en_IN');
        $now   = Carbon::now('UTC')->toIso8601String();

        return [
            'success' => false,
            'data' => [
                'client_id'      =>'bank_validation_' . $faker->bothify('??????????'),
                'account_number' => $payload['account_number'] ?? $faker->bankAccountNumber,
                'account_exists' => true,
                'upi_id'         => null,
                'full_name'      => strtoupper($faker->name),
                'imps_ref_no'    => (string) $faker->numberBetween(600000000000, 699999999999),
                'remarks'        => 'Beneficiary account is blocked/frozen',
                'status'         => 'account_blocked_frozen',
                'ifsc_details' => [
                    'id'         => 0,
                    'ifsc'       => $payload['ifsc'] ?? 'CNRB0010128',
                    'micr'       => '575015091',
                    'iso3166'    => 'IN-KA',
                    'swift'      => null,
                    'bank'       => 'Canara Bank',
                    'bank_code'  => 'CNRB',
                    'bank_name'  => $faker->company,
                    'branch'     => $faker->company,
                    'centre'     => $faker->company,
                    'district'   => $faker->company,
                    'state'      => $faker->state,
                    'city'       => $faker->city,
                    'address'    => $faker->address,
                    'contact'    => null,
                    'imps'       => true,
                    'rtgs'       => true,
                    'neft'       => true,
                    'upi'        => true,
                    'micr_check' => true,
                ],
                'created_at' => $now,
            ],
        ];
    }
}
