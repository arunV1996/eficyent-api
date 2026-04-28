<?php

namespace App\Services\Caliza;

use Exception;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

abstract class Caliza
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
        $keys = config('services.caliza');

        foreach ($keys as $key => $value) {
            
            throw_if(empty($value), new Exception(tr('caliza_config_missing')));
        }

        $this->base_url = "{$keys['url']}";

        return $keys;
    }

    private function timeout(): int
    {
        return (int)($this->keys['timeout'] ?: $this->default_timeout);
    }

    protected function caliza()
    {
        return Http::timeout($this->timeout())
            ->withHeaders([
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
                'X-Internal-API-Key' => $this->keys['token'],
            ])
            ->baseUrl($this->base_url);
    }
}
