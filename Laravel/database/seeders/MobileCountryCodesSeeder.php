<?php

namespace Database\Seeders;

use App\Models\MobileCountryCode;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MobileCountryCodesSeeder extends Seeder
{
    public function run()
    {
        $path = database_path('seeders/data/mobile_country_codes.csv');

        if (!file_exists($path)) {
            $this->command->error("CSV file not found at: $path");
            return;
        }

        $file = fopen($path, 'r');
        $header = fgetcsv($file); 

        $rows = [];

        DB::table('mobile_country_codes')->truncate();

        while (($data = fgetcsv($file)) !== false) {
            
            $row = array_combine($header, $data);

            MobileCountryCode::create([
                'country_name' => $row['country_name'],
                'isd_code' => $row['isd_code'],
                'alpha_2_code' => $row['alpha_2_code'],
                'alpha_3_code' => $row['alpha_3_code'],
                'status' => $row['status'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        fclose($file);
        $this->command->info('Mobile country codes imported successfully!');
    }
}
