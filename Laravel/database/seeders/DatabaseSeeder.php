<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Database\Seeders\EfMobileCountryCodeSeeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            MobileCountryCodesSeeder::class,
            LookupsTableSeeder::class,
            SettingsSeeder::class,
            DiginineBanksSeeder::class,
            DemoMerchantSeeder::class,
            BusinessDocumentTypeSeeder::class,
            EfMobileCountryCodeSeeder::class,
            UserAlertSeeder::class
        ]);
    }
}
