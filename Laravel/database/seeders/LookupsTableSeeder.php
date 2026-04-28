<?php

namespace Database\Seeders;

use App\Helpers\Helper;
use App\Models\Lookup;
use App\Models\State;
use App\Services\Diginine\LookupService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class LookupsTableSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {

        $calizaLookups = Helper::syncCalizaLookups();

        $diginineLookupService = new LookupService();

        $lookupsResponse = $diginineLookupService->getLookups([]);

        if (!isset($lookupsResponse['data']) || empty($lookupsResponse['data'])) {
            return;
        }

        $dignineLookups = Helper::syncDiginineLookups($lookupsResponse['data']);

        $serviceCountriesResponse = $diginineLookupService->getServiceCorridor([]);

        if (!isset($serviceCountriesResponse['data']) || empty($serviceCountriesResponse['data'])) {
            return;
        }

        $dignineCountries = Helper::syncDiginineCountries($serviceCountriesResponse['data']);

        $currencyPaymentMethods = Helper::syncCurrencyPaymentMethodLookups();

        $countryRequirements = Helper::syncCountryRequirementsLookups();


        $this->command->info('Lookups synced : Caliza - ' . $calizaLookups . ', Diginine Lookups - ' . $dignineLookups . ', Diginine Countries - ' . $dignineCountries .
         ', Currency Payment Methods - ' . $currencyPaymentMethods . 'Country Requirements - ' . $countryRequirements);

    }
}
