<?php

namespace App\Services\FvBank;

use Exception;
use Illuminate\Support\Facades\Http;
use App\Helpers\ExternalServiceLogger;
use Illuminate\Http\Client\ConnectionException;

class BeneficiaryAccountService extends FvBank
{
    public function createBeneficiary(array $payload): array
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006,[]];

            $response = Http::acceptJson()->contentType('application/json')->post($this->baseUrl . FVBANK_CREATE_BENEFICIARY_ENDPOINT, $payload);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_CREATE_BENEFICIARY_ENDPOINT, $payload, $responseData, $code, MODULE_FVBANK);

            if (!($responseData['success'] ?? false)) {

                throw new Exception($responseData['error'] ?? tr('something_went_wrong'));
            }

            [$success, $message, $data] = [true, tr('success'), $responseData['data'] ?? []];

        } catch (ConnectionException $e) {

            $message = tr('fvbank_api_timeout_error');

            $code = 30001;

        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return ['success' => $success, 'message' => $message, 'code' => $code, 'data' => $data,];
    }

    public function getPaymentTypes(array $payload): array
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006,[]];

            $response = Http::acceptJson()->contentType('application/json')->post($this->baseUrl . FVBANK_GET_PAYMENT_TYPES_ENDPOINT, $payload);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_GET_PAYMENT_TYPES_ENDPOINT, $payload, $responseData, $code, MODULE_FVBANK);

            if (!($responseData['success'] ?? false)) {

                throw new Exception($responseData['message'] ?? tr('something_went_wrong'));
            }

            [$success, $message, $data] = [true, tr('success'), $responseData['data'] ?? []];

        } catch (ConnectionException $e) {

            $message = tr('fvbank_api_timeout_error');

            $code = 30001;

        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return ['success' => $success, 'message' => $message, 'code' => $code, 'data' => $data,];
    }


     public function getRequiredFields(array $payload): array
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006,[]];

            $response = Http::acceptJson()->contentType('application/json')->post($this->baseUrl . FVBANK_GET_REQUIRED_FIELDS_ENDPOINT, $payload);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_GET_REQUIRED_FIELDS_ENDPOINT, $payload, $responseData, $code, MODULE_FVBANK);

            if (!($responseData['success'] ?? false)) {

                throw new Exception($responseData['message'] ?? tr('something_went_wrong'));
            }

            [$success, $message, $data] = [true, tr('success'), $responseData['data'] ?? []];

        } catch (ConnectionException $e) {

            $message = tr('fvbank_api_timeout_error');

            $code = 30001;

        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return ['success' => $success, 'message' => $message, 'code' => $code, 'data' => $data,];
    }


}
