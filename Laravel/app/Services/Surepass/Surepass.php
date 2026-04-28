<?php

namespace App\Services\Surepass;

use Exception;
use App\Traits\ResponseFormatter;
use Illuminate\Support\Facades\Http;

abstract class Surepass {

    private $default_timeout = 30;

    private $keys;

    protected $base_url;

    protected $isSandbox = false;
    /**
     * Constructor to check API configuration.
     */
    public function __construct()
    {
        $this->keys = $this->configurations();
    }

    /**
     * Check if all Surepass configurations are set.
     *
     * @return array
     * @throws Exception
     */
    private function configurations()
    {
        $keys = config('services.surepass');

        foreach ($keys as $key => $value) {

            throw_if(is_null($value) || $value === '', new Exception(tr('something_went_wrong')));
        }


        $this->base_url = "{$keys['url']}";

        $this->isSandbox = $keys['is_sandbox'];

        return $keys;
    }

    /**
     * To get the Surepass api timeout.
     * 
     * @return int
     */
    private function timeout(): int
    {
        return (int)($this->keys['timeout'] ?: $this->default_timeout);
    }

    /**
     * To get the Surepass api instance.
     * 
     * @return Http
     */
    protected function surepass()
    {
        return Http::timeout($this->timeout())
        ->withHeaders([
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
            'Authorization' => "Bearer {$this->keys['auth_token']}"
        ])            
        ->baseUrl($this->base_url);
    }
}