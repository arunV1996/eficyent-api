<?php

namespace App\Services\InvoiceMate;

use App\Helpers\ExternalServiceLogger;
use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;

abstract class InvoiceMate
{
    protected $base_url;
    protected $keys;

    public function __construct()
    {
        $this->keys = config('services.invoicemate');

        foreach ($this->keys as $key => $value) {
            throw_if(empty($value), new Exception('InvoiceMate config missing'));
        }

        $this->base_url = $this->keys['url'];
    }

    protected function invoicemate()
    {
        return Http::baseUrl($this->base_url)
            ->withHeaders([
                'Accept' => 'application/json',
                'X-API-Key' => $this->keys['api_key'],
            ]);
    }

    protected function getToken()
    {
        $response = Http::baseUrl($this->base_url)
            ->post(INVOICEMATE_AUTH_TOKEN_ENDPOINT, [
                "email" => $this->keys['email'],
                "password" => $this->keys['password'],
            ]);

        $data = $response->json();

        $code = $response->status();

        ExternalServiceLogger::create("{$this->base_url}" . INVOICEMATE_AUTH_TOKEN_ENDPOINT, [], $data, $code, MODULE_INVOICEMATE);

        throw_if(!$response->successful(), new Exception('Something went wrong'));

        $this->keys['api_key'] = $data['apiKey'] ?? null;

        return $data['token'] ?? null;
    }
}
