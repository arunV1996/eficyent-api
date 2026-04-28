<?php

namespace App\Services\Diginine;

use App\Helpers\ExternalServiceLogger;

use App\Services\Diginine\Diginine;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class QuoteService extends Diginine
{
    public function create($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::generate_quote($payload);
            }

            $payload['receiving_amount'] = number_format((float) $payload['receiving_amount'], 4, '.', '');

            $response = $this->diginine()->post(DIGININE_QUOTE_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_QUOTE_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

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

    public function getRates($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $response = $this->diginine()->get(DIGININE_GET_RATES_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . DIGININE_GET_RATES_ENDPOINT, $payload, $data, $code, MODULE_DIGININE);

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
