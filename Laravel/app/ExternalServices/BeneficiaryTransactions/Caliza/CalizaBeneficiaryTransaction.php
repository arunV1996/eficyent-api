<?php

namespace App\ExternalServices\BeneficiaryTransactions\Caliza;

use App\Contracts\BeneficiaryTransactions\BeneficiaryTransactionContract;
use App\Factories\Quotes\QuoteFactory;
use App\Models\Quote;
use App\Services\Caliza\BeneficiaryTransactionService;
use Exception;
use Illuminate\Support\Facades\DB;

class CalizaBeneficiaryTransaction implements BeneficiaryTransactionContract
{
    public function make($user, $quote, $beneficiary_account, $payload)
    {
        if ($beneficiary_account->id !== $quote->beneficiary_account_id) {

            $quote = $this->regenerateQuote($user, $quote, $beneficiary_account);
        }

        $transaction_payload = [
            'simulationId' => $quote->external_reference_id,
            'beneficiaryIp' => request()->ip(),
        ];

        $beneficiarytransactionservice = new BeneficiaryTransactionService();

        $response = $beneficiarytransactionservice->create($transaction_payload);

        throw_if((!$response['success']), new Exception($response['message']));

        if (!isset($response['data']) || (!isset($response['data']['id']))) {

            throw new Exception(api_error(123), 123);
        }

        $transaction_response = $response['data'];

        $fees = $quote->commission_amount + $quote->external_commission_amount;

        return [
            'user_id' => $user->id,
            'sender_id' => $payload['remitter_id'] ?? null,
            'quote_id' => $quote->id,
            'beneficiary_account_id' => $beneficiary_account->id,
            'amount' => $quote->amount,
            'commission_amount' => $fees,
            'total_amount' => $quote->amount + $fees,
            'recipient_amount' => $quote->receiving_amount,
            'receiving_currency' => $quote->receiving_currency,
            'remarks' => $payload['remarks'] ?? '',
            'external_type' => EXTERNAL_TYPE_CALIZA,
            'external_reference_id' => $transaction_response['id'],
            'external_data' => json_encode($transaction_response),
            'external_status' => $transaction_response['status'],
            'status' => caliza_transaction_status_map($transaction_response['status']),
        ];
    }

    public function checkstatus($beneficiary_transaction)
    {
        $beneficiarytransactionservice = new BeneficiaryTransactionService();

        $response = $beneficiarytransactionservice->getStatus($beneficiary_transaction->external_reference_id);

        throw_if((!$response['success']), new Exception($response['message']));

        if (!isset($response['data']) || (!isset($response['data']['status']))) {

            throw new Exception(api_error(125), 125);
        }

        $transaction_status = $response['data']['status'];

        $data = [
            'external_status' => $transaction_status,
            'status' => caliza_transaction_status_map($transaction_status),
            'external_data' => json_encode($response['data']),
        ];

        $beneficiary_transaction = DB::transaction(function () use ($beneficiary_transaction, $data) {

            $beneficiary_transaction->update($data);

            return $beneficiary_transaction->refresh();
        });

        return $beneficiary_transaction;
    }

    public function regenerateQuote($user, $quote, $beneficiary_account)
    {
        $quote_factory = new QuoteFactory();

        $quote_service = $quote_factory->resolve(EXTERNAL_TYPE_CALIZA);

        $validated = [
            'beneficiary_id' => $beneficiary_account->external_reference_id,
            'virtual_account_id' => $quote->virtual_account_id,
            'receiving_currency' => $quote->receiving_currency,
            'recipient_country' => $quote->recipient_country,
            'payment_rail' => $quote->payment_rail,
            'recipient_type' => $quote->recipient_type,
            'quote_type' => $quote->quote_type,
            'amount' => $quote->amount,
        ];

        $response = $quote_service->create($validated, $user);

        $quote = DB::transaction(function () use ($response, $user) {

            $response['user_id'] = $user->id;

            $quote = Quote::create($response);

            throw_if(!$quote, new Exception(api_error(119), 119));

            return $quote->refresh();
        });

        return $quote;
    }
}
