<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;

class UserAlertSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DB::table('settings')->updateOrInsert(
            ['key' => 'user_transaction_alert'],
            [
                'value' => YES,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}
