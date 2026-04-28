<?php

namespace Database\Seeders;

use App\Models\State;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class StatesTableSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $jsonPath = database_path('seeders/data/states.json');

        if (!File::exists($jsonPath)) {
            $this->command->error("states.json file not found at: " . $jsonPath);
            return;
        }

        $json = File::get($jsonPath);
        $states = json_decode($json, true);

        if (empty($states)) {
            $this->command->error("No states found in JSON file.");
            return;
        }

        foreach ($states as $state) {

            $country = get_alpha3_code($state['country_code']);

            State::updateOrCreate(
                ['id' => $state['id']],
                [
                    'name'         => $state['name'],
                    'country_code' => $state['country_code'],
                    'country_alpha3' => $country,
                    'state_code'   => $state['iso2'],
                    'created_at'   => now(),
                    'updated_at'   => now(),
                ]
                );
        }

        $this->command->info("Seeded " . count($states) . " states successfully.");
    }
}
