<?php

namespace App\Services\Remittance;

use Exception;
use Illuminate\Support\Facades\Http;

abstract class Remittance
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
        $keys = config('services.remittance');

        foreach ($keys as $key => $value) {

            throw_if(empty($value), new Exception("Remittance config missing: {$key}"));
        }

        $this->base_url = $keys['base_url'];

        return $keys;
    }

    private function timeout(): int
    {
        return (int) ($this->keys['timeout'] ?? $this->default_timeout);
    }

    private function headers(): array
    {
        return [
            'Authorization' => 'Bearer ' . $this->keys['api_key'],
            'x-api-key' => $this->keys['api_key'],
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'origin' => 'api.eficyent.com'
        ];
    }

    protected function remittance()
    {
        return Http::timeout($this->timeout())
            ->acceptJson()
            ->withHeaders($this->headers())
            ->baseUrl($this->base_url);
    }
}