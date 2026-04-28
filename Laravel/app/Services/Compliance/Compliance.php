<?php

namespace App\Services\Compliance;

use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

abstract class Compliance
{
    private $default_timeout = 30;

    private $keys;

    protected $base_url;

    public function __construct()
    {

        $this->keys = $this->configurations();
    }
    private function configurations()
    {
        $keys = config('services.compliance');

        foreach ($keys as $key => $value) {

            throw_if(empty($value), new Exception(tr('service_config_missing')));
        }

        $this->base_url = "{$keys['url']}";

        return $keys;
    }

    private function timeout(): int
    {
        return (int)($this->keys['timeout'] ?: $this->default_timeout);
    }

    private function getAccessToken(): ?string
    {
        return Cache::store('redis')->remember('compliance_access_token', 1200, function () {

            $response = Http::timeout($this->timeout())
                ->acceptJson()
                ->baseUrl($this->base_url)
                ->post(COMPLIANCE_ACCESS_TOKEN_ENDPOINT, [
                    'email'    => $this->keys['email'],
                    "mfaRequired"=> true,
                    'password' => $this->keys['password'],
                ]);


            throw_if(!$response->successful(), new Exception('Compliance auth failed: ' . $response->body()));

            $data = $response->json('data.tokens');

            throw_if(empty($data['accessToken']), new Exception('Compliance access token missing'));

            return $data['accessToken'];
        });
    }

    private function headers()
    {
        return [
            'Authorization' => 'Bearer ' . $this->getAccessToken(),
            'Idempotency-Key' => (string) Str::uuid(),
            'X-CSRF-TOKEN' => csrf_token(),
            'x-api-key' => $this->keys['api_key'],
        ];
    }
    protected function compliance()
    {
        return Http::timeout($this->timeout())
            ->acceptJson()
            ->withHeaders($this->headers())
            ->baseUrl($this->base_url);
    }
}
