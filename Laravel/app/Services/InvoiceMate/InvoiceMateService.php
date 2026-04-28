<?php

namespace App\Services\InvoiceMate;

use App\Helpers\ExternalServiceLogger;
use App\Services\Logging\ExternalServiceCallLogger;
use Exception;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;

class InvoiceMateService extends InvoiceMate
{
    public function create($txn, $payload)
    {

        $start = microtime(true);

        $to_log = [
            'beneficiary_transaction_id' => $txn?->id,
            'external_type' => EXTERNAL_TYPE_INVOICEMATE,
            'action' => EXTERNAL_CALL_FOR_CREATE,
            'method' => 'POST',
            'endpoint' => INVOICEMATE_PAYOUT_ENDPOINT,
            'request' => $payload,
            'response' => null,
            'code' => null,
            'success' => false,
            'external_reference_id' => null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            $token = $this->getToken();

            $response = $this->invoicemate()
                ->withToken($token)
                ->post(INVOICEMATE_PAYOUT_ENDPOINT, $payload);

            $data = $response->json();

            $code = $response->status();

            $to_log['response'] = $data;

            $to_log['code'] = $response->status();

            $to_log['success'] = $response->successful();

            ExternalServiceLogger::create("{$this->base_url}" . INVOICEMATE_DEPOSIT_ENDPOINT, $payload, $data, $code, MODULE_INVOICEMATE);

            throw_if(!$response->successful(), new Exception($data['message'] ?? 'API Error'));

            $to_log['external_reference_id'] = $data['id'];
            
            return [
                'success' => true,
                'data' => $data
            ];
        } catch (ConnectionException $e) {

            $to_log['error_message'] = 'Timeout';

            return [
                'success' => false,
                'message' => 'Timeout'
            ];
        } catch (Exception $e) {

            $to_log['error_message'] = $e->getMessage();

            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        } finally {

            $to_log['responseTime'] = microtime(true) - $start;

            ExternalServiceCallLogger::log($to_log);
        }
    }

    public function CreateDeposit($txn, $payload)
    {
        $start = microtime(true);

        $to_log = [
            'deposit_transaction_id' => $txn?->id,
            'external_type' => EXTERNAL_TYPE_INVOICEMATE,
            'action' => EXTERNAL_CALL_FOR_CREATE,
            'method' => 'POST',
            'endpoint' => INVOICEMATE_DEPOSIT_ENDPOINT,
            'request' => $payload,
            'response' => null,
            'code' => null,
            'success' => false,
            'external_reference_id' => null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            $token = $this->getToken();

            $response = $this->invoicemate()
                ->withToken($token)
                ->post(INVOICEMATE_DEPOSIT_ENDPOINT, $payload);

            $data = $response->json();

            $code = $response->status();

            $to_log['response'] = $data;

            $to_log['code'] = $response->status();

            $to_log['success'] = $response->successful();

            ExternalServiceLogger::create("{$this->base_url}" . INVOICEMATE_DEPOSIT_ENDPOINT, $payload, $data, $code, MODULE_INVOICEMATE);

            throw_if(!$response->successful(), new Exception($data['message'] ?? 'API Error'));

            $to_log['external_reference_id'] = $data['id'];
            
            return [
                'success' => true,
                'data' => $data
            ];
        } catch (ConnectionException $e) {

            $to_log['error_message'] = 'Timeout';

            return [
                'success' => false,
                'message' => 'Timeout'
            ];
        } catch (Exception $e) {

            $to_log['error_message'] = $e->getMessage();

            return [
                'success' => false,
                'message' => $e->getMessage()
            ];
        } finally {

            $to_log['responseTime'] = microtime(true) - $start;

            Log::info("InvoiceMate Create Deposit API call log : " , $to_log);
        }
    }
}
