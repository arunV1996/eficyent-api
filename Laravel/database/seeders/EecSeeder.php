<?php

namespace Database\Seeders;

use App\Models\Lookup;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class EecSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $type = 'eec_payment_purpose';

        $purposeOfPayments = [
            ['key' => 'salary', 'value' => 'Salary'],
            ['key' => 'savings', 'value' => 'Savings'],
            ['key' => 'loan_from_bank', 'value' => 'Loan From Bank'],
            ['key' => 'final_settlement', 'value' => 'Final Settlement'],
            ['key' => 'credit_card', 'value' => 'Credit Card'],
            ['key' => 'gift_from_family_and_friends', 'value' => 'Gift From Family And Friends'],
            ['key' => 'crypto_currencies', 'value' => 'Crypto Currencies'],
            ['key' => 'funds_from_schemes_and_raffles', 'value' => 'Funds From Schemes And Raffles'],
            ['key' => 'funds_from_dividend_payouts', 'value' => 'Funds From Dividend Payouts'],
            ['key' => 'other_sources', 'value' => 'Other Sources'],
        ];

        foreach ($purposeOfPayments as $purpose) {
            Lookup::updateOrCreate(
                [
                    'key'  => $purpose['key'],
                    'type' => $type,
                ],
                [
                    'value' => $purpose['value'],
                ]
            );
        }
    }
}
