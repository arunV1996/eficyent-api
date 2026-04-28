<?php

namespace App\ExternalServices\InvoiceMate;

use App\Helpers\Helper;
use App\Services\InvoiceMate\InvoiceMateService;
use Exception;
use Illuminate\Support\Facades\Log;

class InvoiceMate
{
    public function make($txn, $user)
    {
        try {

            if(!config('services.invoicemate.is_enabled')) {
                return null;
            }

            $payload = $this->preparePayload($txn, $user);

            Log::info("InvoiceMate transaction payload : " , $payload);
            
            $service = new InvoiceMateService();

            return $service->create($txn, $payload);

        } catch (Exception $e) {
            return null;
        }
    }

    private function preparePayload($txn, $user)
    {
        $remitter = $txn->sender
            ? $txn->sender->first_name . ' ' . $txn->sender->last_name
            : $txn->user->name;

        $beneficiary = $txn->beneficiaryAccount->type == USER_TYPE_BUSINESS
            ? $txn->beneficiaryAccount->business_name
            : $txn->beneficiaryAccount->first_name . ' ' . $txn->beneficiaryAccount->last_name;

        return [
            "unique_id" => $txn->unique_id,
            "user" => $txn->user->merchant ? Helper::MaskData($txn->user->merchant->name) : Helper::MaskData($txn->user->name),
            "total_amount" => $txn->amount,
            "currency" => $txn->currency,
            "remitter" => Helper::MaskData($remitter),
            "beneficiary_name" => Helper::MaskData($beneficiary),
            "status" => beneficiary_transaction_status_label($txn->status),
            "created_at" => $txn->created_at ? common_date($txn->created_at, DEFAULT_TIMEZONE) : '',
        ];
    }

    public function makeDeposit($txn, $user, $accounts = null)
    {
        try {

            if(!config('services.invoicemate.is_enabled')) {
                return null;
            }

            $payload = $this->prepareDepositPayload($txn, $user, $accounts);

            Log::info("InvoiceMate deposit transaction payload : " , $payload);
            
            $service = new InvoiceMateService();

            return $service->CreateDeposit($txn, $payload);

        } catch (Exception $e) {
            return null;
        }
    }

    private function prepareDepositPayload($txn, $user, $accounts = null)
    {
        return [
            "unique_id" => $accounts ? $accounts->unique_id : $txn->unique_id,
            "user" => $txn->user->merchant ? Helper::MaskData("Lulu") : Helper::MaskData("Lulu"),
            "total_amount" => $txn->total_amount,
            "currency" => $txn->currency,
            "type" => strtoupper(DEPOSIT_TYPE_TOPUP),
            "status" => deposit_transaction_status_label($txn->status),
            "created_at" => $txn->created_at ? common_date($txn->created_at, DEFAULT_TIMEZONE) : '',
        ];
    }
}