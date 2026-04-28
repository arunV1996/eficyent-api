<?php

namespace App\Services\Logging;

use App\Models\ExternalServiceCall;

class ExternalServiceCallLogger
{
    public static function log($payload): void 
    {
        ExternalServiceCall::create([
            'beneficiary_transaction_id' => $payload['beneficiary_transaction_id'],
            'external_type' => $payload['external_type'],
            'action' => $payload['action'],
            'method' => $payload['method'],
            'endpoint' => $payload['endpoint'],
            'request_payload' =>  $payload['request'],
            'response_payload' => $payload['response'] ?? null,
            'http_status' => $payload['code'],
            'success' => $payload['success'] ?? false,
            'external_reference_id' => $payload['external_reference_id'] ?? null,
            'error_message' => $payload['error_message'] ?? null,
            'response_time_ms' => $payload['responseTime'],
        ]);
    }
}
