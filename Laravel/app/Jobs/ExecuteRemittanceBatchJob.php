<?php

namespace App\Jobs;

use Exception;
use App\Models\BeneficiaryTransaction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\ExternalServices\Remittance\RemittanceService;
use Illuminate\Support\Facades\Log;

class ExecuteRemittanceBatchJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 0; 

    public int $tries   = 1;

    public function __construct()
    {
        $this->onQueue('stable-coin-remittance-batch');
    }

   public function handle(): void
    {
        try {

            Log::info('Remittance batch job started');

            $limit = config('services.remittance.transactions_limit');
            $sleep = config('services.remittance.sleep');

            $transactions = BeneficiaryTransaction::with(['user', 'sender','beneficiaryAccount','quote'])
                ->whereNull('remittance_data')
                ->orderBy('id')
                ->limit($limit)
                ->get();

            if ($transactions->isEmpty()) {
                Log::info('No transactions found');
                return;
            }

            foreach ($transactions as $txn) {

                try {

                    Log::info('Processing remittance for transaction', [
                        'txn_id' => $txn->id,
                    ]);

                    if (!empty($txn->remittance_data)) {

                        Log::info('Skipping transaction with existing remittance data', [
                            'txn_id' => $txn->id,
                        ]);

                        continue;
                    }

                    app(RemittanceService::class)->make($txn, $txn->user);

                    sleep($sleep);

                } catch (Exception $e) {

                    Log::error('remittance failed for transaction', [
                        'txn_id' => $txn->id,
                        'error'  => $e->getMessage(),
                    ]);
                }
            }

            Log::info('remittance batch job completed');

        } catch (Exception $e) {

            Log::error('remittance batch job failed', [
                'error' => $e->getMessage(),
            ]);
        }
    }
}