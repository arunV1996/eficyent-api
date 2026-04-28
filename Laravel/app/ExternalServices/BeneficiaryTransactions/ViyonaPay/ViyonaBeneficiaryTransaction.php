<?php

namespace App\ExternalServices\BeneficiaryTransactions\ViyonaPay;

use Exception;

use Illuminate\Support\Facades\DB;
use App\Services\ViyonaPay\BeneficiaryTransactionService;
use App\Contracts\BeneficiaryTransactions\BeneficiaryTransactionContract;

class ViyonaBeneficiaryTransaction implements BeneficiaryTransactionContract
{

    public function make($user, $quote, $beneficiary_account, $payload)
    {
    }


    public function checkstatus($beneficiary_transaction)
    {

        $external_data = json_decode($beneficiary_transaction->external_data, true);

        throw_if(!$external_data, new Exception(tr('external_data_not_found')));

        $merchant_reference_number = $external_data['merchant_reference_number'] ?? null;

        throw_if(!$merchant_reference_number, new Exception(tr('merchant_reference_number_not_found')));

        $status_payload = [
            'order_id' => $merchant_reference_number,
            'transaction_date' => $beneficiary_transaction->updated_at->format('d-m-Y'),
        ];

        $beneficiarytransactionservice = new BeneficiaryTransactionService();

        $response = $beneficiarytransactionservice->check_status($status_payload);

        if (isset($response['success']) && $response['success'] && isset($response['data']) && isset($response['data']['status'])) {

            if (isset($response['data']['status'])) {

                $beneficiary_transaction = DB::transaction(function () use ($beneficiary_transaction, $response) {

                    $status_to_update = BENEFICIARY_TRANSACTION_PROCESSING;

                    $message = null;

                    if($response['data']['status'] == "SUCCESS") {

                        $status_to_update = BENEFICIARY_TRANSACTION_COMPLETED;
                    }

                    if($response['data']['status'] == "FAILED") {

                        $status_to_update = BENEFICIARY_TRANSACTION_APPROVED;
                    }

                    if(isset($response['data']['message']) && $response['data']['message']) {

                        $message = $response['data']['message'];
                    }

                    $beneficiary_transaction->update([
                        'external_status' => $response['data']['status'],
                        'status' =>  $status_to_update,
                        'external_data' => json_encode($response['data']),
                        'external_message' => $message ?? null,
                    ]);

                    if(isset($response['data']['bank_reference_number']) && !$beneficiary_transaction->external_reference_id) {

                        $beneficiary_transaction->update([
                            'external_reference_id' => $response['data']['bank_reference_number']
                        ]);
                    }

                    return $beneficiary_transaction->refresh();
                });
            }
        }

        return $beneficiary_transaction;
    }
}
