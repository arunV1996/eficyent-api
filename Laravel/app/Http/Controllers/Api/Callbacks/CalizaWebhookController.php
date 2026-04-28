<?php

namespace App\Http\Controllers\Api\Callbacks;

use App\Enums\TelegramEvent;
use App\Helpers\CommissionsHelper;
use App\Helpers\Helper;
use App\Helpers\TelegramHelper;
use App\Http\Controllers\Controller;
use App\Http\Resources\BeneficiaryTransactionResource;
use App\Http\Resources\DepositTransactionResource;
use App\Jobs\ProcessCalizaWebhook;
use App\Models\BeneficiaryTransaction;
use App\Models\DepositTransaction;
use App\Models\UserService;
use App\Models\VirtualAccount;
use App\Services\Callbacks\CallbackDispatcher;
use App\Services\Telegram\TelegramNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CalizaWebhookController extends Controller
{

    protected $callback;

    public function __construct(CallbackDispatcher $callback)
    {
        $this->callback = $callback;
    }

    public function __invoke(Request $request)
    {

        $data = $request->all();

        TelegramNotifier::notify(TelegramEvent::CALLBACK_RECEIVED, $data , "Caliza");

        Log::info("Received Caliza Webhook:", $data);

        $operation = $data['operation'] ?? null;

        // switch ($operation) {

        //     case 'PAY_IN_ACCOUNT_CREATED':

        //         $beneficiary_account_id = $data['beneficiaryId'] ?? null;

        //         if ($beneficiary_account_id) {

        //             $user = UserService::where('external_reference_id', $beneficiary_account_id)
        //                 ->where('service_type', EXTERNAL_TYPE_CALIZA)
        //                 ->first();

        //             if ($user) {

        //                 $virtual_account_details = $data['data'] ?? null;

        //                 if ($virtual_account_details) {

        //                     $virtual_account =  VirtualAccount::updateOrCreate(
        //                         [
        //                             'account_number' => $virtual_account_details['accountNumber'] ?? null,
        //                             'external_type'  => EXTERNAL_TYPE_CALIZA,
        //                         ],
        //                         [
        //                             'user_id' => $user->user_id,
        //                             'account_holder_name' => $virtual_account_details['receiverName'] ?? null,
        //                             'account_holder_address' => $virtual_account_details['receiverAddress'] ?? null,
        //                             'account_bank_name' => $virtual_account_details['receiverBankName'] ?? null,
        //                             'account_bank_code' => $virtual_account_details['swiftCode'] ?? null,
        //                             'account_bank_address' => $virtual_account_details['receiverBankAddress'] ?? null,
        //                             'routing_number' => $virtual_account_details['routingNumber'] ?? null,
        //                             'external_data' => $virtual_account_details,
        //                             'external_reference_id' => $data['resourceId'] ?? null,
        //                             'status' => VIRTUAL_ACCOUNT_STATUS_CREATED,
        //                         ]
        //                     );

        //                     if($virtual_account) {
                                
        //                         $this->callback->sendCallback($virtual_account->user, CALLBACK_VIRTUAL_ACCOUNT_CREATED, $virtual_account);
        //                     }
        //                 }
        //             }
        //         }

        //         break;

        //     case 'TRANSACTION_COMPLETED':

        //         $transaction_reference_id = $data['resourceId'] ?? null;

        //         if ($transaction_reference_id) {

        //             $transaction = BeneficiaryTransaction::where('external_reference_id', $transaction_reference_id)
        //                 ->where('external_type', EXTERNAL_TYPE_CALIZA)
        //                 ->first();

        //             if ($transaction) {
        //                 $transaction->status = BENEFICIARY_TRANSACTION_COMPLETED;

        //                 $transaction->save();

        //                 Helper::updateLedger($transaction);

        //                 $this->callback->sendCallback(
        //                     $transaction->user,
        //                     CALLBACK_PAYOUT_SUCCESS,
        //                     (new BeneficiaryTransactionResource($transaction))->additional(['resource_method' => CALLBACK_RESPONSE])
        //                 );
        //             }
        //         }

        //         break;

        //     case 'PAYMENT_IN_COMPLETED':

        //         $beneficiary_account_id = $data['beneficiaryId'] ?? null;

        //         if ($beneficiary_account_id) {

        //             $user = UserService::where('external_reference_id', $beneficiary_account_id)
        //                 ->where('service_type', EXTERNAL_TYPE_CALIZA)
        //                 ->first();

        //             if ($user) {

        //                 $deposit_data = $data['data'] ?? null;

        //                 if ($deposit_data) {

        //                     $currency = $deposit_data['to']['currencyCode'] ?? null;

        //                     $virtual_account = VirtualAccount::where('user_id', $user->user_id)
        //                         ->where('currency', $currency)
        //                         ->where('external_type', EXTERNAL_TYPE_CALIZA)
        //                         ->first();

        //                     if ($virtual_account) {

        //                         $fees = $deposit_data['totalFees']['value'] ?? null;

        //                         $commissions = CommissionsHelper::calc_deposit_commissions($user->user, $deposit_data['to']['value'] ?? null,$currency);

        //                         $commission_amount = $commissions['commission_amount'];

        //                         $merchant_commission_amount = $commissions['merchant_commission_amount'];

        //                         $deposit_transaction = DepositTransaction::firstOrCreate(
        //                             ['external_reference_id' => $data['resourceId']],
        //                             [
        //                                 'user_id' => $user->user_id,
        //                                 'virtual_account_id' => $virtual_account->id,
        //                                 'amount' => $deposit_data['from']['value'] ?? null,
        //                                 'external_commission_amount' => $fees,
        //                                 'commission_amount' => $commission_amount,
        //                                 'merchant_commission_amount' => $merchant_commission_amount,
        //                                 'total_commission_amount' => $fees + $commission_amount + $merchant_commission_amount,
        //                                 'total_amount' => ($deposit_data['to']['value'] - ($commission_amount + $merchant_commission_amount)) ?? null,
        //                                 'currency' => $virtual_account->currency,
        //                                 'external_data' => json_encode($deposit_data),
        //                                 'external_type' => EXTERNAL_TYPE_CALIZA,
        //                                 'status' => DEPOSIT_TRANSACTION_PENDING,
        //                                 'external_status' => $deposit_data['status'] ?? null
        //                             ]
        //                         );

        //                         if ($deposit_transaction) {

        //                             Helper::updateLedger($deposit_transaction);

        //                             $this->callback->sendCallback(
        //                                 $deposit_transaction->user,
        //                                 CALLBACK_DEPOSIT_SUCCESS,
        //                                 (new DepositTransactionResource($deposit_transaction))->additional(['resource_method' => CALLBACK_RESPONSE])
        //                             );
        //                         }
        //                     }
        //                 }
        //             }
        //         }

        //         break;

        //     default:

        //         Log::info("Unknown Caliza Webhook Operation: " . $operation);

        //         break;
        // }

        ProcessCalizaWebhook::dispatch($data);

        return response()->json(['status' => 'success'], 200);
    }
}
