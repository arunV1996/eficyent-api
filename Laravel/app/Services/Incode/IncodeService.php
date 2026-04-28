<?php

namespace App\Services\Incode;

use App\Helpers\ExternalServiceLogger;
use Exception;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class IncodeService extends Incode
{
    public function initiate($payload)
    {
        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::omni_start($payload);
            }

            $response = $this->incode()->post(INCODE_OMNI_START_ENDPOINT, $payload);

            $code = $response->status();

            $data = $response->json() ?? [];

            ExternalServiceLogger::create("{$this->base_url}" . INCODE_OMNI_START_ENDPOINT, $payload, $data, $code, MODULE_INCODE);

            throw_if(
                $code !== 200 || empty($data['interviewId']),
                new Exception($data['message'] ?? tr('something_went_wrong'))
            );

            list($success, $message, $code) = [true, tr('success'), $code];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }

    public function get_url($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::get_url($payload);
            }

            $endpoint = INCODE_GET_URL_ENDPOINT . "?components=qr&clientId=" . $this->keys['client_id'];

            $response = Http::timeout($this->timeout())
                ->withHeaders(array_merge($this->headers(), [
                    'X-Incode-Hardware-Id' => $payload['hardwareId']
                ]))
                ->baseUrl($this->base_url)
                ->get($endpoint);

            $code = $response->status();

            $data = $response->json() ?? [];

            ExternalServiceLogger::create("{$this->base_url}" . $endpoint, $payload, $data, $code, MODULE_INCODE);

            throw_if(
                $code !== 200 || empty($data['url']),
                new Exception($data['message'] ?? tr('something_went_wrong'))
            );

            list($success, $message, $code) = [true, tr('success'), $code];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }

    public function get_score($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            if($this->isSandbox) {
                
                return Sandbox::get_score($payload);
            }

            $endpoint = INCODE_GET_SCORE_ENDPOINT . "?id=" . $payload['interviewId'];

            $response = Http::timeout($this->timeout())
                ->withHeaders(array_merge($this->headers(), [
                    'X-Incode-Hardware-Id' => $payload['hardwareId']
                ]))
                ->baseUrl($this->base_url)
                ->get($endpoint);

            $code = $response->status();

            $data = $response->json() ?? [];

            ExternalServiceLogger::create("{$this->base_url}" . $endpoint, $payload, $data, $code, MODULE_INCODE);

            throw_if(
                $code !== 200 || empty($data['overall']),
                new Exception($data['message'] ?? tr('something_went_wrong'))
            );

            list($success, $message, $code) = [true, tr('success'), $code];
        } catch (ConnectionException $e) {

            list($message, $code) = [tr('timeout_error'), 30001];
        } catch (Exception $e) {

            $message = $e->getMessage();
        }

        return [
            'success' => $success,
            'message' => $message,
            'code' => $code,
            'data' => $data ?? []
        ];
    }
}
