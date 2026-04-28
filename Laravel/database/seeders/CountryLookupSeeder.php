<?php

namespace Database\Seeders;

use App\Helpers\Helper;
use App\Models\Lookup;
use App\Models\State;
use App\Services\Diginine\LookupService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class CountryLookupSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {


        $countryRequirements = Helper::syncCountryRequirementsLookups();


        $this->command->info('Lookups synced : Country Requirements - ' . $countryRequirements);

    }
}
