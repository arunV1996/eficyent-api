<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use App\Models\BeneficiaryTransaction;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use App\Actions\BeneficiaryTransaction\SendDebitNotification;

class SendDebitNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct(private BeneficiaryTransaction $transaction)
    {
        $this->onQueue('report_notification_job');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        SendDebitNotification::execute($this->transaction);
    }
}
