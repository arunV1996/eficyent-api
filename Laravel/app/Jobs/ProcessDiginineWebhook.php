<?php

namespace App\Jobs;

use App\Enums\TelegramEvent;
use App\Services\Telegram\TelegramNotifier;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProcessDiginineWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public array $data;

    public $tries = 5;

    /**
     * Create a new job instance.
     */
    public function __construct(array $data)
    {
        $this->data = $data;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        try {
            Log::info("Processing Diginine Webhook:", $this->data);

            TelegramNotifier::notify(TelegramEvent::CALLBACK_RECEIVED, $this->data, "Diginine");

            $callbackUrl = config('services.callbacks.diginine');

            $response = Http::timeout(30)->post($callbackUrl, $this->data);

            Log::info("Callback forwarded for processing", [
                'url'      => $callbackUrl,
                'status'   => $response->status(),
                'response' => $response->json(),
                'payload'  => $this->data,
            ]);

            if (! $response->successful()) {

                throw new Exception("Callback forwarding failed");
            }
        } catch (Exception $e) {

            Log::error("Callback forwarding failed", [
                'error' => $e->getMessage(),
                'payload'  => $this->data,
            ]);

            throw $e;
        }
    }
}
