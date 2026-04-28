<?php

namespace App\Services\ProcessingUnit;

use Exception;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

abstract class ProcessingUnit
{
    private $default_timeout = 90;

    private $keys;

    protected $base_url;

    protected $isSandbox = false;

    public function __construct()
    {

        $this->keys = $this->configurations();
    }
    private function configurations()
    {
        $keys = config('services.processingunit');

        foreach ($keys as $key => $value) {

            throw_if(is_null($value) || $value === '', new Exception(tr('something_went_wrong')));
        }

        $this->base_url = "{$keys['url']}";

        Log::info('ProcessingUnit Configurations: ' . json_encode($keys));

        return $keys;
    }

    private function timeout(): int
    {
        return $this->default_timeout;
    }

    protected function processingunit($endpoint, $payload)
    {
        $signatureData = $this->generateSignature($endpoint, $payload);

        Log::info('ProcessingUnit Signature: ' . json_encode($signatureData));

        return Http::timeout($this->timeout())
            ->withHeaders([
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',

                'x-api-key' => $signatureData['apiKey'],
                'x-api-timestamp' => $signatureData['timestamp'],
                'x-nonce' => $signatureData['nonce'],
                'x-api-signature' => $signatureData['signature'],
            ])
            ->baseUrl($this->base_url);
    }

    private function generateSignature($endpoint, $payload)
    {
        $apiKey = $this->keys['apiKey'];

        $apiSecret = $this->keys['apiSecret'];

        $timestamp = (string) time();

        $nonce = bin2hex(random_bytes(16));

        $segments = explode('/', trim($endpoint, '/'));

        $endpointForSignature = '/' . end($segments);

        $bodyJson = json_encode($payload, JSON_UNESCAPED_SLASHES);

        $bodyJson = preg_replace('/:null(?=[,}])/', ':""', $bodyJson);

        $plainContent = $endpointForSignature . $bodyJson . $timestamp . $nonce . $apiSecret;

        Log::info('ProcessingUnit Plain Content: ' . $plainContent);

        $signature = hash_hmac('sha256', $plainContent, $apiKey);

        Log::info('ProcessingUnit Signature: ' . $signature);

        return [
            'timestamp' => $timestamp,
            'nonce' => $nonce,
            'signature' => $signature,
            'apiKey' => $apiKey
        ];
    }
}
