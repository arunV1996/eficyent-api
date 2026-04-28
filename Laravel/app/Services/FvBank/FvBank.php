<?php

namespace App\Services\FvBank;

use Exception;
use Illuminate\Support\Facades\Http;

abstract class FvBank
{
    protected string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.fv_bank_micro.url'), '/');
    }

    protected function fvbank()
    {
        return Http::acceptJson()->contentType('application/json');
    }

    protected function post(string $endpoint, array $payload = [])
    {
        $response = $this->fvbank()->post($this->baseUrl . $endpoint, $payload);

        $data = $response->json();

        if (!$response->successful() || empty($data['success'])) {

            throw new Exception( $data['error'] ?? $data['message'] ?? tr('something_went_wrong'), $data['error_code'] ?? $response->status());
        }

        return $data;
    }

}
