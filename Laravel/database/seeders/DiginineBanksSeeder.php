<?php

namespace Database\Seeders;

use App\Helpers\Helper;
use App\Models\Lookup;
use App\Models\State;
use App\Models\SupportedCountry;
use App\Services\Diginine\LookupService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class DiginineBanksSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {

        $diginineLookupService = new LookupService();

        $countries = SupportedCountry::where('external_type', EXTERNAL_TYPE_DIGININE)->pluck('country_code')->toArray();

        if (empty($countries)) {
            return;
        }

        $syncedCount = 0;

        foreach ($countries as $country_code) {

            $payload = [
                'receiving_country_code' => get_alpha2_code($country_code),
                'size' => 5000
            ];

            $response = $diginineLookupService->getBanks($payload);

            $syncedCount = Helper::syncDiginineBanks($response['data'], get_alpha3_code($payload['receiving_country_code']));
        }

        $this->command->info('Diginine Banks synced : ' . $syncedCount);
    }
}
