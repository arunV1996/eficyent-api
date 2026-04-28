<?php

namespace App\Services\Caliza;

use App\Helpers\ExternalServiceLogger;
use App\Services\Caliza\Caliza;
use Exception;
use Illuminate\Http\Client\ConnectionException;

class OnboardingService extends Caliza
{
    public function onboarding($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->post(CALIZA_ONBOARDING_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_ONBOARDING_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('onboarding_success')];
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

    public function get($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('caliza_api_failure'), 30006, []];

            $response = $this->caliza()->get(CALIZA_GET_USER_DETAILS_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . CALIZA_GET_USER_DETAILS_ENDPOINT, $payload, $data, $code, MODULE_CALIZA);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, $code, tr('onboarding_success')];
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
