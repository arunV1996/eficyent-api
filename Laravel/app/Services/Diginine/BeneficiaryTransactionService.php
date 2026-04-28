<?php

namespace App\Services\Diginine;

use App\Helpers\ExternalServiceLogger;

use App\Services\Diginine\Diginine;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class BeneficiaryTransactionService extends Diginine
{
    public function create($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::create_transaction($payload);
            }

            $response = $this->diginine()->post(DIGININE_CREATE_TRANSACTION_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_CREATE_TRANSACTION_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

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

    public function confirm($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::confirm_transaction($payload);
            }

            $response = $this->diginine()->post(DIGININE_CONFIRM_TRANSACTION_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_CONFIRM_TRANSACTION_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

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

    public function get($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $response = $this->diginine()->get(DIGININE_GET_TRANSACTION_STATUS_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_GET_TRANSACTION_STATUS_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

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
