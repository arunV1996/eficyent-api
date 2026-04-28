<?php

namespace App\Jobs;

use App\Models\BeneficiaryTransaction;
use App\Services\Callbacks\CallbackDispatcher;
use App\Services\Callbacks\MerchantCallbackDispatcher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendCallbackJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $user;
    public $eventType;
    public $payload;

    /**
     * Create a new job instance.
     */
    public function __construct($user, $eventType, $payload)
    {
        $this->user = $user;
        $this->eventType = $eventType;
        $this->payload = $payload;

        $this->onQueue('send_callback_job');
    }

    /**
     * Execute the job.
     */
    public function handle()
    {

        Log::info("SendCallbackJob started", [
            'user_id' => $this->user->id ?? null,
            'event' => $this->eventType,
        ]);

        $callbackService = new MerchantCallbackDispatcher();

        $logs = $callbackService->sendCallback($this->user, $this->eventType, $this->payload);

        if(! empty($this->payload->unique_id)) {

            if($beneficiary_transaction = BeneficiaryTransaction::select('id', 'unique_id')->where('unique_id', $this->payload->unique_id)->first()) {
                $beneficiary_transaction->loggable()->create([
                    'logs' => $logs
                ]);
            }
        }

        Log::info("SendCallbackJob ended", [
            'user_id' => $this->user->id ?? null,
            'event' => $this->eventType,
        ]);
    }
}
