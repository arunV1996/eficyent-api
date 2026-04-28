<?php

namespace App\Jobs;

use App\Models\BeneficiaryAccountValidation;
use App\Models\BeneficiaryTransaction;
use App\Repositories\BeneficiaryAccountRepository;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class AccountValidationJob implements ShouldQueue
{
    use Dispatchable, Queueable, SerializesModels;

    public int $timeout = 0;

    public int $tries   = 1;

    public function __construct()
    {
        $this->onQueue('account-validation-job');
    }

    public function handle()
    {
        $processed = [];

        Log::info('Account validation job started');

        BeneficiaryTransaction::with('beneficiaryAccount', 'user')
            ->where('receiving_currency', 'INR')
            ->whereDate('created_at', '>=', '2026-03-25')
            ->chunk(500, function ($transactions) use ($processed) {

                foreach ($transactions as $txn) {

                    $account = $txn->beneficiaryAccount;

                    if (!$account || !$account->account_number || !$account->swift_code) {

                        Log::warning('Skipping transaction with invalid beneficiary account', [
                            'txn_id' => $txn->id,
                        ]);
                        continue;
                    }

                    $accountNumber = $account->account_number;
                    $ifsc = $account->swift_code;

                    $exists = BeneficiaryAccountValidation::where('account_number', $accountNumber)
                        ->where('code', $ifsc)
                        ->exists();

                    if ($exists) {

                        Log::info('Account already validated, skipping', [
                            'account_number' => $accountNumber,
                            'ifsc' => $ifsc,
                        ]);
                        continue;
                    }

                    Log::info('Validating account', [
                        'account_number' => $accountNumber,
                        'ifsc' => $ifsc,
                    ]);

                    app(BeneficiaryAccountRepository::class)->validate_account(
                        $txn->user,
                        [
                            'account_number' => $accountNumber,
                            'ifsc' => $ifsc,
                        ]
                    );
                }
            });
    }
}
