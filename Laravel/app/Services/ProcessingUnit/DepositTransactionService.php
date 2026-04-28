<?php

namespace App\Services\ProcessingUnit;

use App\Helpers\ExternalServiceLogger;
use App\Services\Logging\ExternalServiceCallLogger;
use App\Services\ProcessingUnit\ProcessingUnit;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class DepositTransactionService extends ProcessingUnit
{
    public function create($beneficiaryTransaction, $payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $endpoint = PROCESSING_UNIT_CREATE_DEPOSIT_ENDPOINT;

            $response = $this->processingunit($endpoint, $payload)
                ->post($endpoint, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            $success = $data['success'] ?? false;

            ExternalServiceLogger::create("{$this->base_url}" . PROCESSING_UNIT_CREATE_DEPOSIT_ENDPOINT, $payload, $data, $code, MODULE_PROCESSINGUNIT);

            throw_if(!$data['success'], new Exception(isset($data['error']) ? $data['error'] : tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('something_went_wrong'), 30001];
        } catch (Exception $e) {

            list($message) = [$e->getMessage()];

        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }
}
