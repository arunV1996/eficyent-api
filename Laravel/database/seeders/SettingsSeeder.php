<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SettingsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        //
        DB::table('settings')->updateOrInsert(
            ['key' => 'site_name'],
            [
                'value' => 'EFICyent',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'admin_take_count'],
            [
                'value' => 10,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'site_icon'],
            [
                'value' => "http://app.eficyent.com/img/favicons/android-chrome-192x192.png",
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'site_logo'],
            [
                'value' => "https://cms-pro.eficyent.com/storage/uploads/sites/c3e424b0ba8fc4c8f778d9b90d302d2fcab6a7a8.png",
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'inactivity_in_seconds'],
            [
                'value' => 300,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'password_reset_expiry'],
            [
                'value' => 60,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'invite_link_expiry'],
            [
                'value' => '60',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'front_end_url'],
            [
                'value' => 'https://eficyent-app-v1.rare-able.com/',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'remitter_kyc'],
            [
                'value' => REMITTER_AUTO_APPROVED,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'remitter_kyb'],
            [
                'value' => REMITTER_AUTO_APPROVED,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'kyc_service'],
            [
                'value' => ID_VERIFIED_BY_ADMIN,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }
}
