<?php

namespace App\Services\HeraldSumsub;

use App\Helpers\ExternalServiceLogger;
use Exception;
use Illuminate\Http\Client\ConnectionException;

class HeraldKycService extends HeraldSumSub
{
    public function initiate($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('herald_api_failure'), 30006, []];

            $payload = array_merge($payload, [

                'user_id' => $this->keys['merchant_id'],
            ]);

            $endpointPath = HERALD_SUMSUB_ACCESS_TOKEN_ENDPOINT;

            $body = json_encode((object) $payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $timestamp = (string) floor(microtime(true));

            $apiKey  = $this->keys['x_api_key'];

            $saltKey = $this->keys['salt_key'];

            $plainContent = "{$endpointPath}{$body}{$timestamp}{$saltKey}";

            $signature = hash_hmac('sha256', $plainContent, $apiKey);

            $headers = [
                'X-Api-Key'       => $apiKey,
                'X-Api-Timestamp' => $timestamp,
                'X-Api-Signature' => $signature,
            ];

            $response = $this->herald()->withHeaders($headers)->post(HERALD_SUMSUB_ACCESS_TOKEN_ENDPOINT, $payload);

            list($code, $data) = [
                $response['status_code'] ?? $response->status(),
                is_array($response) ? $response : $response->json()
            ];

            ExternalServiceLogger::create("{$this->base_url}" . HERALD_SUMSUB_ACCESS_TOKEN_ENDPOINT, $payload, $data, $code, MODULE_HERALD_SUMSUB);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, tr('herald_kyc_success'), $code];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('herald_api_timeout_error'), 30001];
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

    public function check_status($email)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('herald_api_failure'), 30006, []];

            $endpointPath = HERALD_SUMSUB_STATUS_ENDPOINT;

            $queryParams = ['email' => $email];

            $body = json_encode((object) $queryParams, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $timestamp = (string) floor(microtime(true));

            $apiKey  = $this->keys['x_api_key'];

            $saltKey = $this->keys['salt_key'];

            $plainContent = "{$endpointPath}{$body}{$timestamp}{$saltKey}";

            $signature = hash_hmac('sha256', $plainContent, $apiKey);

            $headers = [
                'X-Api-Key'       => $apiKey,
                'X-Api-Timestamp' => $timestamp,
                'X-Api-Signature' => $signature,
            ];

            $response = $this->herald()->withHeaders($headers)->get(HERALD_SUMSUB_STATUS_ENDPOINT, $queryParams);

            list($code, $data) = [ $response->status(),is_array($response) ? $response : $response->json()];

            ExternalServiceLogger::create("{$this->base_url}" . HERALD_SUMSUB_STATUS_ENDPOINT, $queryParams, $data, $code, MODULE_HERALD_SUMSUB);

            throw_if(!$data['success'], new Exception(isset($data['message']) ? $data['message'] : tr('something_went_wrong')), new Exception(tr('something_went_wrong')));

            $data = $data['data'];

            list($success, $message, $code) = [true, tr('herald_kyc_success'), $code];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('herald_api_timeout_error'), 30001];
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
