<?php

namespace App\Services\Report;

use Exception;
use App\Traits\ResponseFormatter;
use Illuminate\Http\Client\ConnectionException;

class Debit extends Report
{
    use ResponseFormatter;

    private $debit_endpoint = 'api/debit_transactions';

    public function debit(array $payload)
    {
        try {

            $logs[] = 'Report Server: Debit API';

            $logs[] = "URL: {$this->keys['base_url']}/{$this->debit_endpoint}";

            $request_payload = $payload;

            $logs[] = "Request Payload:";

            $logs[] = $request_payload;

            $start = microtime(true);

            $logs[] = "Requested At : " . now()->format('d M Y h:i:s.u A');

            $response = $this->api()->post($this->debit_endpoint, $request_payload);

            $end = microtime(true);

            $logs[] = "Responded At : " . now()->format('d M Y h:i:s.u A');

            $logs[] = "Response Time: " . ($end - $start) . " seconds";

            [$status_code, $body] = [
                $response->status(),
                $response->json()
            ];

            $logs[] = "Status Code: {$status_code}";

            $logs[] = "Response Body:";

            $logs[] = $body;

            throw_if(! $response->successful() || empty($body['success']), new Exception($body['message'] ?? tr('`debit_request_failed`'), 1451));

            info($logs);

            return $this->success('SUCCESS', 200, $body);

        } catch(ConnectionException $e) {

            $logs[] = "ConnectionException Error: {$e->getMessage()}";

            $message = tr('request_timeout');

        } catch (Exception $e) {

            $message = $e->getMessage();

            $logs[] = "Exception Error: $message";
        }

        info($logs);

        return $this->fail($message, $e->getCode());
    }
}
