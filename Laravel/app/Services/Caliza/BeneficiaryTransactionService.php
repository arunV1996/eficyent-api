<?php

namespace App\Services\Caliza;

use App\Helpers\ExternalServiceLogger;
use App\Services\Caliza\Caliza;
use Exception;
use Illuminate\Http\Client\ConnectionException;

class BeneficiaryTransactionService extends Caliza
{
    public function create($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->post(CALIZA_EXECUTE_PAYOUT_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_EXECUTE_PAYOUT_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('caliza_api_timeout_error'), 30001];
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

    public function getStatus($external_reference_id)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->get(CALIZA_PAYOUT_STATUS_ENDPOINT, ['transaction_id' => $external_reference_id]);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_PAYOUT_STATUS_ENDPOINT, ['transaction_id' => $external_reference_id], $data, $code, MODULE_CALIZA);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('caliza_api_timeout_error'), 30001];
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
