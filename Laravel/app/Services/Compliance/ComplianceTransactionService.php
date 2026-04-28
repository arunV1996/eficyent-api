<?php

namespace App\Services\Compliance;

use App\Helpers\ExternalServiceLogger;
use App\Services\Logging\ExternalServiceCallLogger;
use Exception;

use Illuminate\Http\Client\ConnectionException;

class ComplianceTransactionService extends Compliance
{
    public function create($beneficiaryTransaction ,$payload)
    {

        $start = microtime(true);

        $to_log = [
            'beneficiary_transaction_id' => $beneficiaryTransaction?->id,
            'external_type' => EXTERNAL_TYPE_COMPLIANCE,
            'action' => EXTERNAL_CALL_FOR_CREATE,
            'method' => 'POST',
            'endpoint' => COMPLIANCE_CREATE_TRANSACTION_ENDPOINT,
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

            $response = $this->compliance()->post(COMPLIANCE_CREATE_TRANSACTION_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            $success = $data['success'] ?? false;

            $to_log['response'] = $data;

            $to_log['code'] = $code;

            $to_log['success'] = $success;

            ExternalServiceLogger::create("{$this->base_url}" . COMPLIANCE_CREATE_TRANSACTION_ENDPOINT, $payload, $data, $code, MODULE_COMPLIANCE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];

        } catch (ConnectionException $e) {

            $to_log['error_message'] = tr('timeout_error');

            $to_log['code'] = 0;

            list($message, $code) = [tr('something_went_wrong'), 30001];

        } catch (Exception $e) {


            list($message) = [$e->getMessage()];

            $to_log['error_message'] = $e->getMessage();

        }
        finally {

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
}
