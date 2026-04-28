<?php

namespace App\Services\Report;

use Exception;
use Illuminate\Support\Facades\Http;

abstract class Report
{
    private $timeout = 90;

    protected $keys = [];

    public function __construct()
    {
        $this->keys = $this->configuration();
    }

    private function configuration() {

        $keys = config('services.report_server');

        foreach ($keys as $key => $value) {
            throw_if(empty($value), new Exception(tr('report_api_config_pending', $key)));
        }

        return $keys;
    }

    protected function api()
    {
        return Http::timeout($this->keys['timeout'] ?? $this->timeout)
        ->withHeaders([
            $this->keys['header_key'] => $this->keys['header_value']
        ])
        ->baseUrl($this->keys['base_url']);
    }
}