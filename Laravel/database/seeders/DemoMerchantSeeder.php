<?php

namespace Database\Seeders;

use App\Models\Merchant;
use App\Models\State;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;

class DemoMerchantSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
       
        $first_user = User::where('user_type', USER_TYPE_BUSINESS)->where('onboarding_step',ONBOARDING_STEP_FOUR_COMPLETED)->first();

        if($first_user){

            Merchant::create([
                'user_id' => $first_user->id,
                'name' => $first_user->first_name . ' ' . $first_user->last_name,
                'email' => $first_user->email,
                'password' => Hash::make('Demo@1234'),
            ]);
        }
    }
}
