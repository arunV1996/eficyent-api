<?php

namespace App\Jobs;

use App\Models\BeneficiaryTransaction;
use App\Repositories\BeneficiaryTransactionRepository;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class CheckBeneficiaryTransactionsStatus implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
        //
    }

    /**
     * Execute the job.
     */
    public function handle(BeneficiaryTransactionRepository $repository): void
    {

        $statusToCheck = [BENEFICIARY_TRANSACTION_INITIATED, BENEFICIARY_TRANSACTION_PROCESSING];

        BeneficiaryTransaction::whereIn('status', $statusToCheck)
            ->chunkById(50, function ($transactions) use ($repository) {

                foreach ($transactions as $transaction) {
                    try {

                        $repository->checkStatus($transaction->user, ['beneficiary_transaction_id' => $transaction->unique_id]);
                    } catch (Exception $e) {

                        Log::error($e->getMessage());
                    }
                }
            });
    }
}
