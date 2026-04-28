<?php

namespace App\Services\Callbacks;

use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CallbackDispatcher
{
    public function sendCallback($user, $eventType, $payload)
    {

        $merchant = $user->merchant ?? null;

        if (!$merchant || empty($merchant->callback_url)) {

            return false;
        }

        $callbackUrl = $merchant->callback_url;

        try {

            $data = [
                'event' => $eventType,
                'data'  => $payload,
                'timestamp' => now()->timestamp,
            ];

            $response = Http::timeout(30)->post($callbackUrl, $data);

            Log::info("Callback sent to user {$merchant->id}", [
                'url' => $callbackUrl,
                'status' => $response->status(),
                'response' => $response->json(),
                'payload' => $data,
            ]);

            return true;
        } catch (Exception $e) {

            Log::error("Callback failed to send to user {$merchant->id}", [
                'url' => $callbackUrl,
                'event' => $eventType,
                'payload' => $data,
                'exception_message' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
