<?php

namespace App\Services\Massive;

use App\Helpers\ExternalServiceLogger;
use App\Services\Massive\Massive;
use App\Services\Massive\Sandbox as MassiveSandbox;
use Exception;

use Illuminate\Http\Client\ConnectionException;

class QuoteService extends Massive
{
    public function create($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if ($this->isSandbox) {

                $response = MassiveSandbox::generate_quote($payload);
            } else {


                $endpoint = MASSIVE_GET_QUOTE_ENDPOINT;

                $response = $this->massive()
                    ->withHeaders([
                        'x-api-key' => $this->keys['api_key'],
                    ])
                    ->post($endpoint, $payload);
            }

            list($code, $data) = [
                $response['success'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . MASSIVE_GET_QUOTE_ENDPOINT, $payload, $data, $code, MODULE_MASSIVE);

            throw_if(!$data['success'], new Exception(tr('something_went_wrong')));

            $data = $data['data']['data'];

            throw_if(empty($data) || $data['status'] !== 'success', new Exception(tr('something_went_wrong')));

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
