<?php

namespace App\Services\Caliza;

use App\Helpers\ExternalServiceLogger;
use App\Services\Caliza\Caliza;
use Exception;
use Illuminate\Http\Client\ConnectionException;

class VirtualAccountService extends Caliza
{
    public function create($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->post(CALIZA_VIRTUAL_ACCOUNT_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_VIRTUAL_ACCOUNT_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

            // throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            // $data = $data['data'];

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

    public function get_virtual_accounts($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->get(CALIZA_GET_VIRTUAL_ACCOUNTS_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_GET_VIRTUAL_ACCOUNTS_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

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

    public function get_virtual_account_balance($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->post(CALIZA_GET_USER_BALANCE_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_GET_USER_BALANCE_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

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
