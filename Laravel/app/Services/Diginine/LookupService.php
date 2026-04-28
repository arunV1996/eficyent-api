<?php

namespace App\Services\Diginine;

use App\Helpers\ExternalServiceLogger;

use App\Services\Diginine\Diginine;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class LookupService extends Diginine
{
    public function getServiceCorridor($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $response = $this->diginine()->get(DIGININE_SERVICE_CORRIDOR_ENDPOINT);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_SERVICE_CORRIDOR_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
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

    public function getLookups($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $response = $this->diginine()->get(DIGININE_GET_LOOKUPS_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_GET_LOOKUPS_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
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

    public function getBanks($payload)
    {
        list($success, $message, $code, $data) = [false, tr('banks_fetch_failed'), 500, []];

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $response = $this->diginine()->get(DIGININE_GET_BANKS_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_GET_BANKS_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('success')];

        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
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
