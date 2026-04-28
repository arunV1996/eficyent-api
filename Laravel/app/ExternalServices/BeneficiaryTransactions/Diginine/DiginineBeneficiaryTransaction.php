<?php

namespace App\ExternalServices\BeneficiaryTransactions\Diginine;

use App\Contracts\BeneficiaryTransactions\BeneficiaryTransactionContract;
use App\Helpers\Helper;
use App\Services\Diginine\BeneficiaryTransactionService;
use Exception;
use Illuminate\Support\Facades\DB;

class DiginineBeneficiaryTransaction implements BeneficiaryTransactionContract
{
    public function make($user, $quote, $beneficiary_account, $payload)
    {
        $transaction_payload = $this->preparePayload($user, $quote, $beneficiary_account, $payload);

        $beneficiarytransactionservice = new BeneficiaryTransactionService();

        $response = $beneficiarytransactionservice->create($transaction_payload);

        throw_if((!$response['success']), new Exception($response['message']));

        if (!isset($response['data']) || (!isset($response['data']['transaction_ref_number']))) {

            throw new Exception(api_error(123), 123);
        }

        $confirm_payload = [
            'transaction_ref_number' => $response['data']['transaction_ref_number'],
        ];

        $confirm_transaction_response = $beneficiarytransactionservice->confirm($confirm_payload);

        throw_if((!$confirm_transaction_response['success']), new Exception($confirm_transaction_response['message']));

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
            'external_type' => EXTERNAL_TYPE_DIGININE,
            'external_reference_id' => $transaction_response['transaction_ref_number'],
            'external_data' => json_encode($transaction_response),
            'external_status' => $transaction_response['state'],
            'status' => diginine_transaction_status_map($transaction_response['sub_state']),
        ];
    }


    public function preparePayload($user, $quote, $beneficiary_account, $payload)
    {

        $service_type = Helper::format_payment_type($user->user_type, $quote->recipient_type);

        $data = [

            // COMMON 
            "type"                           => DIGININE_TRANSACTION_SEND,
            "purpose_of_txn"                 => $beneficiary_account->beneficiaryAdditionalDetail->purpose_of_transaction ?? "SAVG",
            "source_of_income"               => $user->userInformation->source_of_income ?? "SVGS",
            "instrument"                     => DIGININE_TRANSACTION_REMITTANCE,
            "message"                        => $payload['remarks'] ?? "",
            "service_type"                   => $service_type,
            "source_channel"                 => DIGININE_TRANSACTION_CHANEL,
            "sender_mobile_number"           => $user->mobile_country_code . '' . $user->mobile,
            "sender_nationality"             => get_alpha2_code($user->userInformation->country),
            "sender_id_code"                 => (string) ($user->userInformation->id_type ?? "4"),
            "sender_id"                      => (string) ($user->userInformation->id_number ?? "784199173717119"),
            "sender_address_type"            => "PRESENT",
            "sender_address_line"            => $user->userInformation->address_1 ?? "",
            "sender_address_town_name"       => $user->userInformation->city ?? "",
            "sender_address_country_code"    => get_alpha2_code($user->userInformation->country),
            // "sender_date_of_birth"           => $user->dob ?? "",
            "receiver_mobile_number"         => $beneficiary_account->mobile_country_code . '' . $beneficiary_account->mobile,
            "receiver_nationality"           => get_alpha2_code($beneficiary_account->country),
            "receiver_address_type"          => "PRESENT",
            "receiver_address_line"          => $beneficiary_account?->beneficiaryAdditionalDetail?->address_line1 ?? "",
            "receiver_address_town_name"     => $beneficiary_account?->beneficiaryAdditionalDetail?->city ?? "",
            "receiver_address_country_code"  => get_alpha2_code($beneficiary_account?->beneficiaryAdditionalDetail?->country) ?? "",
            "receiver_bank_details_account_type_code"   => "1",
            "transaction_quote_id"                      => $quote->external_reference_id,
            "sending_country_code"                      => "SG",
            "agent_transaction_ref_number"              => $quote->unique_id,
            "ordering_institution_name"                 => "Eficyent",
            "ordering_institution_address_country_code" => "SG",
            "ordering_institution_address_line"         => "Singapore",
            "ordering_institution_address_type"         => "PRESENT",
            "ordering_institution_address_town_name"    => "Singapore",
            "ordering_institution_address_postal_code"  => "687687",
            // C2C  
            "sender_first_name"                 => $service_type === C2C ? $user->first_name : null,
            "sender_last_name"                  => $service_type === C2C ? $user->last_name : null,
            "receiver_first_name"               => $service_type === C2C ? $beneficiary_account->first_name : null,
            "receiver_last_name"                => $service_type === C2C ? $beneficiary_account->last_name : null,
            "sender_profession_code"            => $service_type === C2C ? (string) ($user->userInformation->profession ?? "4049") : null,
            // B2C      
            "name"                              => $service_type === B2C ? $user->userInformation->business_name ?? "" : null,
            // B2B
            "type_of_business"                  => in_array($service_type, [B2B, B2C]) ? ($user->userInformation->type_of_business ?? "3") : null,
            "proofs_content_type"               => in_array($service_type, [B2B, B2C]) ? ($payload['proofs_content_type'] ?? null) : null,
            "proofs_document_type"              => in_array($service_type, [B2B, B2C]) ? ($payload['proofs_document_type'] ?? null) : null,
            "proofs_front_data"                 => in_array($service_type, [B2B, B2C]) ? ($payload['proofs_front_data'] ?? null) : null,
            "proofs_back_data"                  => in_array($service_type, [B2B, B2C]) ? ($payload['proofs_back_data'] ?? null) : null,
            "sender_ubos"                       => in_array($service_type, [B2B, B2C]) ? ($payload['sender_ubos'] ?? []) : null,
        ];

        $data = array_filter($data, fn($v) => !is_null($v));

        if (get_alpha2_code($beneficiary_account->country) == 'IN' && get_alpha2_code($beneficiary_account->country) == 'BD') {

            $data['receiver_bank_details_iso_code'] = $beneficiary_account->swift_code;
        } else {

            $data['receiver_bank_details_routing_code'] = $beneficiary_account->routing_number;
        }

        if (get_alpha2_code($beneficiary_account->country) == 'PK' || get_alpha2_code($beneficiary_account->recipient_country) == 'AE') {

            $data['receiver_bank_details_iban'] = $beneficiary_account->account_number;
        } else {

            $data['receiver_bank_details_account_number'] = $beneficiary_account->account_number;
        }

        return $data;
    }

    public function checkstatus($beneficiary_transaction)
    {

        if(empty($beneficiary_transaction->external_reference_id)) {

            return $beneficiary_transaction;
        }
        
        $beneficiarytransactionservice = new BeneficiaryTransactionService();

        $transaction_payload = [
            'transaction_ref_number' => $beneficiary_transaction->external_reference_id
        ];

        $response = $beneficiarytransactionservice->get($transaction_payload);

        if (isset($response['success']) && $response['success'] && isset($response['data']) && isset($response['data']['sub_state'])) {

            $beneficiary_transaction = DB::transaction(function () use ($beneficiary_transaction, $response) {

                $beneficiary_transaction = $beneficiary_transaction->newQuery()->whereKey($beneficiary_transaction->id)->lockForUpdate()->first();

                $newStatus = diginine_transaction_status_map($response['data']['sub_state']);

                $beneficiary_transaction->update([
                    'external_status' => $response['data']['sub_state'],
                    'status' => $newStatus,
                    'external_data' => json_encode($response['data']),
                ]);

                if ($newStatus == BENEFICIARY_TRANSACTION_COMPLETED) {

                    Helper::updateLedger($beneficiary_transaction);
                }

                if ($newStatus == BENEFICIARY_TRANSACTION_FAILED) {

                    Helper::create_refund($beneficiary_transaction);
                }

                return $beneficiary_transaction->refresh();
            });
        }

        return $beneficiary_transaction;
    }
}
