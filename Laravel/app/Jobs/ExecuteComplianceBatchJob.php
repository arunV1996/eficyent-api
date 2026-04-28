<?php

namespace App\Jobs;

use Exception;
use App\Models\BeneficiaryTransaction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\ExternalServices\Compliance\ComplianceService;
use Illuminate\Support\Facades\Log;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;

class ExecuteComplianceBatchJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 0; 

    public int $tries   = 1;

    public function __construct()
    {
        $this->onQueue('compliance-transactions-batch');
    }

    public function handle(): void
    {
        try {

            Log::info('Compliance batch job started');

            $limit = config('services.compliance.transactions_limit');
            
            $sleep = config('services.compliance.sleep');

             $transactions = BeneficiaryTransaction::with(['user', 'sender','beneficiaryAccount','quote'])
                ->whereNull('compliance_data')
                ->orderBy('id')
                ->limit($limit)
                ->get();

            if ($transactions->isEmpty()) {
                Log::info('No transactions found');
                return;
            }

            foreach ($transactions as $txn) {

                try {

                    Log::info('Processing compliance for transaction', [
                        'txn_id' => $txn->unique_id,
                    ]);

                    if (!empty($txn->compliance_data)) {

                        Log::info('Skipping transaction with existing compliance data', [
                            'txn_id' => $txn->unique_id,
                        ]);

                        continue;
                    }

                    $compliance = app(ComplianceService::class)->make($txn, $txn->user , false);

                    Log::info('Compliance response received for transaction', [
                        'txn_id' => $txn->unique_id,
                        'response' => $compliance,
                    ]);

                    if (($compliance['success'] ?? false) === true){

                        Log::info('Processing unit sync for transaction', [
                            'txn_id' => $txn->unique_id,
                        ]);

                        app(ProcessingUnit::class)->sync($txn);

                    } else {

                        Log::warning('Compliance failed', [
                            'txn_id' => $txn->unique_id,
                            'response' => $compliance,
                        ]);
                    }
                    sleep($sleep);
                    
                } catch (Exception $e) {

                    Log::error('Compliance failed for transaction', [
                        'txn_id' => $txn->unique_id,
                        'error'  => $e->getMessage(),
                    ]);
                }
            }

            Log::info('Compliance batch job completed');

        } catch (Exception $e) {

            Log::error('Compliance batch job failed', [
                'error' => $e->getMessage(),
            ]);
        }
    }
}