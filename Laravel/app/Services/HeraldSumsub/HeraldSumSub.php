<?php

namespace App\Services\HeraldSumsub;

use Exception;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Http;

abstract class HeraldSumSub
{
    private $default_timeout = 30;

    protected $keys;

    protected $base_url;

    public function __construct()
    {

        $this->keys = $this->configurations();
    }
    private function configurations()
    {
        $keys = config('services.herald_sumsub_service');

        foreach ($keys as $key => $value) {

            throw_if(empty($value), new Exception(tr('herald_sumsub_config_missing')));
        }

        $this->base_url = "{$keys['url']}" . HERALD_SUMSUB_BASE_ENDPOINT;

        return $keys;
    }

    private function timeout(): int
    {
        return (int)($this->keys['timeout'] ?: $this->default_timeout);
    }

    protected function herald()
    {
        return Http::timeout($this->timeout())
            ->baseUrl($this->base_url);
    }
}
