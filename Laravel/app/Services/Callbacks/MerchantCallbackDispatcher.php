<?php

namespace App\Services\Callbacks;

use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MerchantCallbackDispatcher
{
    public function sendCallback($user, $eventType, $payload)
    {
        $merchant = $user->merchant ?? null;

        $logs['merchant_id'] = $merchant->id ?? '--';

        if (! $merchant || empty($merchant->callback_url)) {

            $message = "Callback not configured for user {$logs['merchant_id']}";

            $logs['send_callback'] = 'FAILED';

            $logs['reason'] = $message;

            info($logs);

            return $logs;
        }

        $callbackUrl = $merchant->callback_url;

        $logs['url'] = $callbackUrl;

        try {

            $data = [
                'event' => $eventType,
                'data'  => $payload instanceof \Illuminate\Http\Resources\Json\JsonResource
                    ? $payload->resolve()
                    : $payload,
                'timestamp' => now()->timestamp,
            ];

            $logs['payload'] = $data;

            $logs['requested_at'] = now()->format('d M Y H:i:s.u');

            $response = Http::timeout(30)->post($callbackUrl, $data);
            
            $logs['completed_at'] = now()->format('d M Y H:i:s.u');

            $logs['status'] = $response->status();

            $logs['response'] = $response->json();

            $logs['send_callback'] = $response->successful() ? 'SUCCESS' : 'FAILED';

        } catch (Exception $e) {

            $logs['send_callback'] = 'FAILED';

            $logs['reason'] = $e->getMessage();
        }

        Log::info('CallbackLog for user ' . $logs['merchant_id'] . ': ' . json_encode($logs, JSON_UNESCAPED_SLASHES));

        return $logs;
    }
}
