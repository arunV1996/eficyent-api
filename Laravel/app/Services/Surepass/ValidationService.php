<?php

namespace App\Services\Surepass;

use App\Helpers\ExternalServiceLogger;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class ValidationService extends Surepass
{
    public function validate($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                $response = Sandbox::validate($payload);
            }else{

                $endpoint = SUREPASS_BANK_VERIFICATION_ENDPOINT;

                $response = $this->surepass()->post($endpoint, $payload);
            }

            list($code, $data) = [
                $response['success'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . SUREPASS_BANK_VERIFICATION_ENDPOINT, $payload, $data, $code, MODULE_SUREPASS);

            // throw_if(!isset($data['success']) || !isset($data['data']), new Exception(tr('something_went_wrong')));

            // throw_if(empty($data), new Exception(tr('something_went_wrong')));

            list($success, $message, $code) = [true, tr('success'), $code];
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
