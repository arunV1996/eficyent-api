<?php

namespace App\Services\ProcessingUnit;

use App\Helpers\ExternalServiceLogger;
use App\Services\Logging\ExternalServiceCallLogger;
use App\Services\ProcessingUnit\ProcessingUnit;

use Exception;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;

class BeneficiaryTransactionService extends ProcessingUnit
{
    public function create($beneficiaryTransaction, $payload)
    {
        $start = microtime(true);
        
        $to_log = [
            'beneficiary_transaction_id' => $beneficiaryTransaction?->id,
            'external_type' => EXTERNAL_TYPE_PROCESSING_UNIT,
            'action' => EXTERNAL_CALL_FOR_CREATE,
            'method' => 'POST',
            'endpoint' => PROCESSING_UNIT_CREATE_TRANSACTION_ENDPOINT,
            'request' => $payload,
            'response' => null,
            'code' => null,
            'success' => false,
            'external_reference_id' => null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $endpoint = PROCESSING_UNIT_CREATE_TRANSACTION_ENDPOINT;

            $response = $this->processingunit($endpoint, $payload)
                ->post($endpoint, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            $success = $data['success'] ?? false;

            $to_log['response'] = $data;

            $to_log['code'] = $code;

            $to_log['success'] = $success;

            ExternalServiceLogger::create("{$this->base_url}" . PROCESSING_UNIT_CREATE_TRANSACTION_ENDPOINT, $payload, $data, $code, MODULE_PROCESSINGUNIT);

            throw_if(!$data['success'], new Exception(isset($data['error']) ? $data['error'] : tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            $to_log['error_message'] = tr('timeout_error');

            $to_log['code'] = 0;
            
            list($message, $code) = [tr('something_went_wrong'), 30001];
        } catch (Exception $e) {

            list($message) = [$e->getMessage()];

            $to_log['error_message'] = $e->getMessage();
        }finally {

            $to_log['responseTime'] = microtime(true) - $start;
            
            ExternalServiceCallLogger::log($to_log);
        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }

    public function sync($beneficiaryTransaction, $payload)
    {
        $start = microtime(true);
        
        $to_log = [
            'beneficiary_transaction_id' => $beneficiaryTransaction?->id,
            'external_type' => EXTERNAL_TYPE_PROCESSING_UNIT,
            'action' => EXTERNAL_CALL_FOR_CREATE,
            'method' => 'POST',
            'endpoint' => PROCESSING_UNIT_SYNC_TRANSACTION_ENDPOINT,
            'request' => $payload,
            'response' => null,
            'code' => null,
            'success' => false,
            'external_reference_id' => null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $endpoint = PROCESSING_UNIT_SYNC_TRANSACTION_ENDPOINT;

            $response = $this->processingunit($endpoint, $payload)
                ->post($endpoint, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            $success = $data['success'] ?? false;

            $to_log['response'] = $data;

            $to_log['code'] = $code;

            $to_log['success'] = $success;

            ExternalServiceLogger::create("{$this->base_url}" . PROCESSING_UNIT_SYNC_TRANSACTION_ENDPOINT, $payload, $data, $code, MODULE_PROCESSINGUNIT);

            throw_if(!$data['success'], new Exception(isset($data['error']) ? $data['error'] : tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            $to_log['error_message'] = tr('timeout_error');

            $to_log['code'] = 0;
            
            list($message, $code) = [tr('something_went_wrong'), 30001];
        } catch (Exception $e) {

            list($message) = [$e->getMessage()];

            $to_log['error_message'] = $e->getMessage();
        }finally {

            $to_log['responseTime'] = microtime(true) - $start;
            
            ExternalServiceCallLogger::log($to_log);
        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }

    public function validateAccount($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $endpoint = PROCESSING_UNIT_VALIDATE_ACCOUNT_ENDPOINT;

            $response = $this->processingunit($endpoint, $payload)
                ->post($endpoint, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            $success = $data['success'] ?? false;

            Log::info("Account validation response", [
                'payload' => $payload,
                'response' => $data,
            ]);

            ExternalServiceLogger::create("{$this->base_url}" . PROCESSING_UNIT_VALIDATE_ACCOUNT_ENDPOINT, $payload, $data, $code, MODULE_PROCESSINGUNIT);

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
