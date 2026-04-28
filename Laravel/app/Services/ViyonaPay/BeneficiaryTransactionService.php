<?php

namespace App\Services\ViyonaPay;

use App\Helpers\ExternalServiceLogger;

use Exception;

use Illuminate\Http\Client\ConnectionException;

class BeneficiaryTransactionService extends ViyonaPay
{

    public function check_status($payload)
    {

        try {

            list($success, $message, $code, $data) = [false, tr('something_went_wrong'), 30006, []];

            $accessToken = $this->getAccessToken();

            $service = [
                'url' => $this->config['base_url'] . VIYONAPAY_GET_TRANSACTION_STATUS_ENDPOINT,
                'reference' => 'Check Transaction Status',
                'access_token' => $accessToken,
            ];

            $response = $this->request(VIYONAPAY_GET_TRANSACTION_STATUS_ENDPOINT_V2, $payload, $accessToken, $service);

            throw_if(!isset($response['result']) || $response['result'] !== 'success', new Exception(tr('something_went_wrong')));

            $data = isset($response['response_body']) ? $response['response_body'] : [];

            list($success, $message, $code) = [true, $code, tr('success')];

        } catch (ConnectionException $e) {

            list($message, $code) = [tr('viyona_pay_connection_error'), 30001];
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
