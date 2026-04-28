<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\MobileCountryCode;
use Carbon\Carbon;

class EfMobileCountryCodeSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/data/ef_mobile_country_code.json');

        if (!file_exists($path)) {

            throw new \Exception('JSON file not found: ' . $path);
        }

        $json = file_get_contents($path);

        $countries = json_decode($json, true);

        if (!is_array($countries)) {

            throw new \Exception('Invalid JSON format');
        }

        foreach ($countries as $country) {

            MobileCountryCode::firstOrCreate(
                [
                    'alpha_2_code' => $country['alpha2Code'],
                ],
                [
                    'country_name' => $country['name'],
                    'isd_code'     => ltrim($country['isoCode'], '0'),
                    'alpha_3_code' => $country['alpha3Code'],
                    'status'       => 1,
                    'created_at'   => Carbon::now(),
                    'updated_at'   => Carbon::now(),
                ]
            );
        }
    }
}
