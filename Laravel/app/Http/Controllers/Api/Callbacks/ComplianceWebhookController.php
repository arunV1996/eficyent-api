<?php

namespace App\Http\Controllers\Api\Callbacks;

use App\Enums\TelegramEvent;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;
use App\Http\Controllers\Controller;
use App\Models\BeneficiaryTransaction;
use App\Services\Callbacks\CallbackDispatcher;
use App\Services\Logging\ExternalServiceCallLogger;
use App\Services\Telegram\TelegramNotifier;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ComplianceWebhookController extends Controller
{
     protected $callback;

    public function __construct(CallbackDispatcher $callback)
    {
        $this->callback = $callback;
    }

    public function __invoke(Request $request)
    {
        $payload = $request->all();

        $start = microtime(true);

        $to_log = [
            'beneficiary_transaction_id' => null,
            'external_type' => EXTERNAL_TYPE_COMPLIANCE,
            'action' => EXTERNAL_CALL_FOR_CALLBACK,
            'method' => 'POST',
            'endpoint' => null,
            'request' => $payload,
            'response' => null,
            'code' => 200,
            'success' => false,
            'external_reference_id' => null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            Log::info("Compliance webhook received", $payload);

            $event = $payload['event'] ?? null;
            $data  = $payload['data'] ?? null;

            if (!$event || !$data) {

                Log::warning("Invalid compliance webhook structure");

                $to_log['response'] = ['status' => 'ignored'];

                $to_log['success'] = true;

                return response()->json(['status' => 'ignored'], 200);
            }

            $complianceTransactionId = $data['transactionId'] ?? null;
            $externalStatus          = $data['status'] ?? null;
            $complianceStatus        = $data['complianceStatus'] ?? null;

            if (!$complianceTransactionId) {

                Log::warning("Compliance webhook missing transactionId");

                return response()->json(['status' => 'ignored'], 200);
            }

            $transaction = BeneficiaryTransaction::where('compliance_data->transaction_id', $complianceTransactionId)->whereIn('status', [BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED, BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD])->first();

            if (!$transaction) {

                Log::warning("Local transaction not found", [

                    'compliance_transaction_id' => $complianceTransactionId
                ]);

                return response()->json(['status' => 'not_found'], 200);
            }

            $to_log['beneficiary_transaction_id'] = $transaction->id;

            $to_log['external_reference_id'] = $complianceTransactionId;

            if ($event === 'transaction.approved' && $complianceStatus == 'PASSED') {

                $transaction->status = BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED;

                app(ProcessingUnit::class)->make($transaction, $transaction->user);

            } elseif ($event === 'transaction.rejected' || $complianceStatus == 'FAILED') {

                $transaction->status = BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED;
            }

            $transaction->compliance_notes = $data['notes'] ?? null;
            $transaction->save();

            $to_log['response'] = $data;

            $to_log['success'] = true;
            
            Log::info("Compliance transaction updated successfully", [

                'local_txn_id' => $transaction->id,
                'new_status'   => $transaction->status
            ]);

            return response()->json(['status' => 'success'], 200);

        } 
        catch (Exception $e) {

            $to_log['code'] = 500;

            $to_log['error_message'] = $e->getMessage();

            $to_log['response'] = [
                'status' => 'error',
                'message' => $e->getMessage()
            ];

            Log::error("Compliance webhook failed", [

                'error'   => $e->getMessage(),
                'payload' => $payload
            ]);

            return response()->json(['status' => 'error'], 200);

        } finally {

            $to_log['responseTime'] = microtime(true) - $start;

            ExternalServiceCallLogger::log($to_log);
        }
    }
}
