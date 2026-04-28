<?php

namespace App\Services\Massive;

use Exception;

use Illuminate\Support\Facades\Http;

abstract class Massive
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
        $keys = config('services.massive');

        foreach ($keys as $key => $value) {

            throw_if(is_null($value) || $value === '', new Exception(tr('something_went_wrong')));
        }

        $this->base_url = "{$keys['url']}";

        $this->isSandbox = $keys['is_sandbox'];

        return $keys;
    }

    private function timeout(): int
    {
        return $this->default_timeout;
    }

    protected function massive()
    {
        return Http::timeout($this->timeout())
            ->withHeaders([
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ])
            ->baseUrl($this->base_url);
    }
}
