<?php

namespace App\Services\Incode;

use Exception;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

abstract class Incode
{
    private $default_timeout = 30;

    protected $keys;

    protected $base_url;

    protected $isSandbox = false;

    public function __construct()
    {

        $this->keys = $this->configurations();
    }
    private function configurations()
    {
        $keys = config('services.incode');

        foreach ($keys as $key => $value) {

            throw_if(is_null($value) || $value === '', new Exception(tr('incode_configuration_pending')));
        }

        $this->base_url = "{$keys['url']}";

        $this->isSandbox = $keys['is_sandbox'];

        return $keys;
    }

    protected function headers()
    {
        return [
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'x-api-key' => $this->keys['api_key'],
            'api-version' => $this->keys['api_version']
        ];
    }

    protected function timeout(): int
    {
        return (int)($this->keys['timeout'] ?: $this->default_timeout);
    }

    protected function incode()
    {

        return Http::timeout($this->timeout())
            ->withHeaders($this->headers())
            ->baseUrl($this->base_url);
    }
}
