<?php

namespace App\Jobs;

use App\Models\BeneficiaryTransaction;
use App\ExternalServices\InvoiceMate\InvoiceMate;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendToInvoiceMateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;

    public $backoff = [60, 300, 600];
    
    public $timeout = 120;
    /**
     * Create a new job instance.
     */
    protected $txn;

    public function __construct(BeneficiaryTransaction $txn)
    {
        $this->txn = $txn;

        $this->onQueue('invoice_mate_sync_job');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        try {
            $txn = $this->txn->fresh();

            if(!$txn){
                
                return;
            }

            $user = $txn->user;

            if (!$user->merchant) {
                return;
            }

            $merchant_setting = $user->merchant->settings()->where('key', 'enable_accounts')->first();

            if ($merchant_setting && $merchant_setting->value == '0') {

                return;
            }

            Log::info("Sending data to Invoice Mate", [
                'transaction' => $txn->unique_id
            ]);

            $response = app(InvoiceMate::class)->make($txn, $txn->user);

            Log::info("Invoice Mate response", [
                'transaction' => $txn->unique_id,
                'response' => $response
            ]);

            // if (!$response || empty($response['success'])) {
            //     throw new Exception("Invoice Mate response failed");
            // }
        } catch (Exception $e) {

            throw $e;
        }
    }
}
