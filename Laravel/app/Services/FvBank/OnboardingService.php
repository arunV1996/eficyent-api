<?php

namespace App\Services\FvBank;

use Exception;
use Illuminate\Support\Facades\Http;
use App\Helpers\ExternalServiceLogger;
use Illuminate\Http\Client\ConnectionException;

class OnboardingService extends FvBank
{
    public function onboarding(array $payload)
    {
        try {

            info("FvBank Onboarding payload: " . json_encode($payload));

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006, []];

            $response = Http::acceptJson()->contentType('application/json')->post($this->baseUrl . FV_BANK_ONBOARDING_ENDPOINT, $payload);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FV_BANK_ONBOARDING_ENDPOINT, $payload, $responseData,$code, MODULE_FVBANK);

            if (!($responseData['success'] ?? false)) {

                throw new Exception($responseData['error'] ?? tr('intiate_onboarding_failed'));
            }

            [$success, $message, $data] = [true, tr('success'), $responseData['data'] ?? []];

        } catch (ConnectionException $e) {

            [$message, $code] = [tr('fvbank_api_timeout_error'), 30001];

        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return ['success' => $success, 'message' => $message, 'code' => $code, 'data' => $data,];
    }

    public function usersList()
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006, []];

            $response = Http::acceptJson()->contentType('application/json')->get($this->baseUrl . FV_BANK_USERS_LIST_ENDPOINT, []);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FV_BANK_ONBOARDING_ENDPOINT, [], $responseData, $code, MODULE_FVBANK);

            if (!($responseData['success'] ?? false)) {

                throw new Exception($responseData['error'] ?? tr('intiate_onboarding_failed'));
            }

            [$success, $message, $data] = [true, tr('success'), $responseData['data'] ?? []];
        } catch (ConnectionException $e) {

            [$message, $code] = [tr('fvbank_api_timeout_error'), 30001];
        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return ['success' => $success, 'message' => $message, 'code' => $code, 'data' => $data,];
    }
}
