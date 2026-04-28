<?php

namespace App\Http\Controllers\Api\Callbacks;

use App\Enums\TelegramEvent;
use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Resources\BeneficiaryTransactionCallbackResource;
use App\Jobs\SendCallbackJob;
use App\Jobs\SendDebitNotificationJob;
use App\Models\BeneficiaryTransaction;
use App\Models\DepositTransaction;
use App\Services\Logging\ExternalServiceCallLogger;
use App\Services\Telegram\TelegramNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ProcessingUnitWebhookController extends Controller
{
    //
    public function __invoke(Request $request)
    {
        $start = microtime(true);

        $data = $request->all();

        Log::info("Processing Unit Webhook Received", $data);

        $to_log = [
            'beneficiary_transaction_id' => null,
            'external_type' => EXTERNAL_TYPE_PROCESSING_UNIT,
            'action' => EXTERNAL_CALL_FOR_CALLBACK,
            'method' => 'POST',
            'endpoint' => 'Processing Unit Webhook',
            'request' => [],
            'response' => $data,
            'code' => null,
            'success' => true,
            'external_reference_id' => $data['utr_number'] ?? null,
            'error_message' => null,
            'responseTime' => null,
        ];

        try {

            $module = $data['module'] ?? null;

            if (!$module) {
                Log::warning("Webhook missing module", $data);
                return response()->json(['received' => true], 200);
            }

            switch ($module) {

                case 'withdraw':

                    $orderId      = $data['order_id'] ?? null;
                    $status       = $data['status'] ?? null;
                    $utr          = $data['utr_number'] ?? null;
                    $service_type = $data['service_type'] ?? null;
                    $rail         = $data['rail'] ?? null;
                    $message      = $data['message'] ?? null;
                    $failed_reason = $data['failed_reason'] ?? null;
                    $service_mid  = $data['service_mid'] ?? null;

                    if (!$orderId || !$status) {
                        Log::warning("Missing order_id or status", $data);
                        return response()->json(['received' => true], 200);
                    }

                    $txn = BeneficiaryTransaction::where('order_id', $orderId)->first();

                    if (!$txn) {
                        Log::warning("Transaction not found for order_id: {$orderId}");
                        return response()->json(['received' => true], 200);
                    }

                    $to_log['beneficiary_transaction_id'] = $txn->id;

                    $oldStatus = $txn->status;

                    $statusData   = ProcessingUnit_status_map($status);
                    $mappedStatus = $statusData['mapped'];

                    if ($statusData['is_new']) {
                        $to_log['success'] = false;
                        $to_log['error_message'] = "New status received: " . $statusData['original'];
                    }

                    $finalStatus = null;

                    if ($oldStatus == BENEFICIARY_TRANSACTION_COMPLETED) {

                        if ($mappedStatus == BENEFICIARY_TRANSACTION_FAILED) {

                            Log::warning("Update for COMPLETED -> FAILED txn", [
                                'order_id' => $orderId
                            ]);

                            $finalStatus = BENEFICIARY_TRANSACTION_FAILED;
                        } else {

                            $finalStatus = BENEFICIARY_TRANSACTION_COMPLETED;
                        }
                    } else {

                        if ($service_type == 'EVP' && $mappedStatus == BENEFICIARY_TRANSACTION_FAILED) {

                            Log::info("Skipping rejected transaction for EVP", [
                                'order_id' => $orderId
                            ]);

                            $to_log['success'] = false;
                            $to_log['error_message'] = "Skipping rejected status for EVP";
                        } else {

                            $finalStatus = $mappedStatus;
                        }
                    }

                    if ($finalStatus === null || $finalStatus === $oldStatus) {

                        // Log::info("Duplicate/ignored webhook", [
                        //     'order_id' => $orderId,
                        //     'status' => $mappedStatus
                        // ]);

                        // return response()->json(['received' => true], 200);

                        $finalStatus = $oldStatus;
                    }

                    $updateData = [
                        'status' => $finalStatus
                    ];

                    if (!empty($utr)) {
                        $updateData['external_reference_id'] = $utr;
                    }

                    if (!empty($service_type)) {
                        $updateData['external_type'] = ProcessingUnitServiceMap($service_type);
                    }

                    if (!empty($rail)) {
                        $updateData['rail'] = $rail;
                    }

                    if (!empty($message)) {
                        $updateData['notes'] = $message;
                    }

                    if (!empty($service_mid)) {
                        $updateData['service_mid'] = strtoupper($service_mid);
                    }

                    $txn->update($updateData);

                    Log::info("Transaction updated", [
                        'order_id' => $orderId,
                        'old_status' => $oldStatus,
                        'new_status' => $finalStatus
                    ]);

                    switch ($finalStatus) {

                        case BENEFICIARY_TRANSACTION_COMPLETED:

                            SendCallbackJob::dispatch(
                                $txn->user,
                                CALLBACK_PAYOUT_SUCCESS,
                                new BeneficiaryTransactionCallbackResource($txn)
                            );

                            SendDebitNotificationJob::dispatch($txn);
                            break;

                        case BENEFICIARY_TRANSACTION_FAILED:

                            SendCallbackJob::dispatch(
                                $txn->user,
                                CALLBACK_PAYOUT_REJECTED,
                                new BeneficiaryTransactionCallbackResource($txn)
                            );

                            if ($oldStatus != BENEFICIARY_TRANSACTION_FAILED) {
                                Helper::create_refund($txn);
                            }

                            break;
                    }

                    break;

                case 'deposit':

                    $orderId = $data['order_id'] ?? null;

                    $status  = $data['status'] ?? null;

                    if (!$orderId || !$status) {

                        Log::warning("Missing order_id or status", $data);

                        return response()->json(['received' => true], 200);
                    }

                    $statustoCheck = [
                        DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
                        DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING
                    ];

                    $txn = DepositTransaction::where('unique_id', $orderId)->whereIn('status', $statustoCheck)->first();

                    if (!$txn) {

                        Log::warning("Transaction not found for order_id: {$orderId}");

                        return response()->json(['received' => true], 200);
                    }

                    $statusData = ProcessingUnit_Depositstatus_map($status);

                    $mappedStatus = $statusData['mapped'];

                    $updateData = [
                        'status' => $mappedStatus,
                    ];

                    $oldStatus = $txn->status;

                    $txn->update($updateData);

                    Helper::updateLedger($txn);

                    Log::info("Deposit Transaction updated", [
                        'order_id' => $orderId,
                        'old_status' => $oldStatus,
                        'new_status' => $mappedStatus
                    ]);

                    break;

                default:
                    Log::warning("Unknown module received from Processing Unit", ['module' => $module]);
                    break;
            }
        } catch (\Throwable $e) {

            $to_log['success'] = false;
            $to_log['error_message'] = $e->getMessage();

            Log::error("Processing Unit Webhook Failed", [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'payload' => $data
            ]);
        } finally {

            $to_log['responseTime'] = round((microtime(true) - $start) * 1000, 2);

            ExternalServiceCallLogger::log($to_log);
        }

        return response()->json(['received' => true], 200);
    }
}
