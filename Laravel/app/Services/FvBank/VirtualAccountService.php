<?php

namespace App\Services\FvBank;

use Exception;
use Illuminate\Support\Str;
use App\Models\VirtualAccount;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use App\Helpers\ExternalServiceLogger;
use Illuminate\Http\Client\ConnectionException;

class VirtualAccountService extends FvBank
{
     public function create(array $payload)
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006, []];

            $response = Http::acceptJson()->contentType('application/json')->post($this->baseUrl . FVBANK_CREATE_VIRTUAL_ACCOUNT_ENDPOINT, $payload);

            info("Create Virtual Account Response: " . json_encode($response->json()));

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_CREATE_VIRTUAL_ACCOUNT_ENDPOINT, $payload, $responseData,$code, MODULE_FVBANK);

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


    public function fileUpload($user, array $payload): array
    {
        try {

            if (!isset($payload['file'], $payload['customField']) || !$payload['file'] instanceof UploadedFile) {

                throw_if(true, new Exception('Invalid file upload payload'));
            }

            $file = $payload['file'];

            $response = Http::acceptJson()
            ->attach(
                'file',
                fopen($file->getRealPath(), 'r'),
                $file->getClientOriginalName()
            )
            ->post($this->baseUrl . FVBANK_FILE_UPLOAD_ENDPOINT, [
                'customField' => $payload['customField']
            ]);

            info("File Upload Response: " . json_encode($response->json()));

            if (!$response->successful()) {
                return [
                    'success' => false,
                    'message' => 'File upload request failed',
                    'code'    => $response->status(),
                    'data'    => [],
                ];
            }

            $responseData = $response->json();

            if (!($responseData['success'] ?? false)) {
                return [
                    'success' => false,
                    'message' => $responseData['error'] ?? 'File upload failed',
                    'code'    => $responseData['error_code'] ?? 500,
                    'data'    => [],
                ];
            }

            return [
                'success' => true,
                'message' => 'Success',
                'code'    => 200,
                'data'    => $responseData['data'] ?? [],
            ];

        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
                'code'    => 500,
                'data'    => [],
            ];
        }
    }


    public function getVirtualAccount($payload)
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006, []];

            $response = Http::acceptJson()->get($this->baseUrl . FVBANK_GET_VIRTUAL_ACCOUNT_ENDPOINT, $payload);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_GET_VIRTUAL_ACCOUNT_ENDPOINT, [], $responseData, $code,MODULE_FVBANK);

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

        return compact('success', 'message', 'code', 'data');
    }

    public function getVirtualAccountBalance($user)
    {
        try {

            [$success, $message, $code, $data] = [false, tr('fvbank_api_failure'), 30006, []];

            $response = Http::acceptJson()->get($this->baseUrl . FVBANK_GET_VIRTUAL_ACCOUNT_BALAENCE_ENDPOINT);

            $responseData = $response->json();

            $code = $response->status();

            ExternalServiceLogger::create("{$this->baseUrl}" . FVBANK_GET_VIRTUAL_ACCOUNT_BALAENCE_ENDPOINT, [], $responseData, $code,MODULE_FVBANK);

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

        return compact('success', 'message', 'code', 'data');
    }
}
