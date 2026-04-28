<?php

namespace App\Jobs;

use Exception;
use Illuminate\Bus\Queueable;
use App\Actions\UserAlert\UserAlert;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Akaunting\Setting\Facade as Setting;

class UserTransactionAlertJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct() {
        
        $this->onQueue('user_transaction_alert');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        try {

            throw_if(!Setting::get('user_transaction_alert'), new Exception("UserTransactionAlert Disabled"));

            UserAlert::execute([
                'date' => now(DEFAULT_TIMEZONE)->format('Y-m-d')
            ]);

            info("UserTransactionAlert Success");
        } catch (Exception $e) {

            info("UserTransactionAlert Error : " . $e->getMessage());
        }
    }
}
