<?php

namespace App\ExternalServices\ProcessingUnit;

use App\Enums\TelegramEvent;
use App\Models\BeneficiaryAccountValidation;
use App\Models\Lookup;
use App\Models\SenderDocument;
use App\Models\UserDocument;
use App\Models\VirtualAccount;
use App\Services\ProcessingUnit\BeneficiaryTransactionService;
use App\Services\ProcessingUnit\DepositTransactionService;
use App\Services\Telegram\TelegramNotifier;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\Log;
use stdClass;

class ProcessingUnit
{
    public function make($txn, $user)
    {
        try {

            Log::info("Processing Unit initiated", ['txn_id' => $txn->id]);

            $transactionPayload = $this->preparePayload($txn, $user);

            Log::info("Processing unit transaction payload : " , $transactionPayload);

            $service = new BeneficiaryTransactionService();

            $response = $service->create($txn, $transactionPayload);

            if (isset($response['success']) && $response['success']) {

                $status = $response['data']['status'] ?? null;

                if ($status) {

                    $statusData = ProcessingUnit_status_map($status);

                    $mappedStatus = $statusData['mapped'];

                    if ($txn->status !== $mappedStatus) {

                        $txn->update([
                            'status' => $mappedStatus
                        ]);
                    }

                    Log::info("Processing Unit response", [
                        'response' => $response ,
                        'order_id' => $txn->order_id,
                        'incoming_status' => $status,
                        'mapped_status' => $mappedStatus
                    ]);
                }
            }else{

                Log::error("Processing Unit initiation failed", [
                    'txn_id' => $txn->id,
                    'Processing Unit response' => $response
                ]);

                $txn->update([
                    'status' => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED
                ]);

                TelegramNotifier::notify(TelegramEvent::PROCESSING_UNIT_INITIATION_FAILED, $txn, null, $response['message'] ?? null);
            }
        } catch (Exception $e) {

            Log::error("Processing Unit failed", [
                'txn_id' => $txn->id,
                'error' => $e->getMessage()
            ]);

            $txn->update([
                'status' => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED
            ]);

            TelegramNotifier::notify(TelegramEvent::PROCESSING_UNIT_INITIATION_FAILED, $txn, null, $e->getMessage());

            return null;
        }
    }

    public function sync($txn)
    {
        try {

            Log::info("Processing Unit sync initiated", ['txn_id' => $txn->id]);

            if ($txn->created_at->gte(Carbon::parse('2026-03-26'))) {

                return $txn;
            }
            $statustosync = [
                BENEFICIARY_TRANSACTION_COMPLETED,
                BENEFICIARY_TRANSACTION_FAILED,
                BENEFICIARY_TRANSACTION_CANCELLED,
                BENEFICIARY_TRANSACTION_EXPIRED,
                BENEFICIARY_TRANSACTION_REJECTED,
            ];

            if (!in_array($txn->status, $statustosync)) {

                Log::info("Processing Unit sync skipped due to status", [
                    'txn_id' => $txn->id,
                    'status' => $txn->status
                ]);

                return $txn;
            }

            $user = $txn->user;

            if (!$txn->order_id) {

                $txn->update([
                    'order_id' => generateOrderID()
                ]);
            }

            $transactionPayload = $this->preparePayload($txn, $user, true);

            Log::info("Processing unit transaction payload : " , $transactionPayload);

            if ($txn->external_type != "em") {

                $transactionPayload['service_type'] = MapProcessingUnitService($txn->external_type);
            }
            if ($txn->external_reference_id) {
                
                $transactionPayload['payment_id'] = $txn->external_reference_id;

                $transactionPayload['external_reference_id'] = $txn->external_reference_id;
            }

            $transactionPayload['created_at'] = $txn->created_at->format('Y-m-d H:i:s');

            $transactionPayload['status'] = MapProcessingUnitStatus($txn->status);

            $service = new BeneficiaryTransactionService();

            $response = $service->sync($txn, $transactionPayload);

            Log::info("Processing Unit sync response", [
                'response' => $response ,
                'order_id' => $txn->order_id,
            ]);

            Log::info("Processing Unit sync completed", ['txn_id' => $txn->id]);

        } catch (Exception $e) {

            return null;
        }
    }

    private function preparePayload($txn, $user, $sync = false)
    {
        $beneficiaryAccount = $txn->beneficiaryAccount ?? null;

        $beneficiaryExtra = $beneficiaryAccount->beneficiaryAdditionalDetail ?? null;

        $sender = $txn->sender ?? null;

        $common = [
            'order_id' => $txn->order_id,
            'from_amount' => $txn->amount,
            'from_currency' => $txn->quote->source->currency,
            'amount' => $txn->recipient_amount,
            'exchange_rate' => format_processing_unit_fx_rate($txn->quote->fx_rate),
            'receiving_currency' => $txn->receiving_currency,
            'side' => $txn->quote->quote_type,
            'remarks' => $txn->remarks,
            'supporting_document' => $txn->supporting_document,
            'purpose_of_payment' => $beneficiaryExtra?->purpose_of_transaction,
            'rail' => strtoupper($beneficiaryAccount->payment_rail ? $beneficiaryAccount->payment_rail : "")
        ];

        $beneficiary = [
            'type' => $beneficiaryAccount->type == USER_TYPE_INDIVIDUAL ? 'INDIVIDUAL' : 'BUSINESS',
            'first_name' => $beneficiaryAccount->first_name ?? null,
            'last_name' => $beneficiaryAccount->last_name ? $beneficiaryAccount->last_name : $beneficiaryAccount->first_name,
            'business_name' => $beneficiaryAccount->business_name ?? null,
            'address_1' => $beneficiaryExtra?->address_line1,
            'address_2' => $beneficiaryExtra?->address_line2,
            'city' => $beneficiaryExtra?->city ? $beneficiaryExtra?->city : $user->userInformation->city,
            'state' => $beneficiaryExtra?->state,
            'postal_code' => $beneficiaryExtra?->postal_code,
            'country' => $beneficiaryExtra?->country,
            'currency' => $beneficiaryAccount->currency,
            'bank_name' => $beneficiaryAccount->bank_name ?: $beneficiaryAccount->swift_code,
            'account_name' => $beneficiaryAccount->account_name,
            'account_number' => $beneficiaryAccount->account_number,
            'iban' => $beneficiaryAccount->account_number,
            'account_type' => $beneficiaryAccount->account_type ?: 'Checking',
            'routing_number' => $beneficiaryAccount->routing_number,
            'swift_code' => $beneficiaryAccount->swift_code,
            'ifsc_code' => $beneficiaryAccount->swift_code,
            'iso_code' => $beneficiaryAccount->swift_code,
            'email' => $beneficiaryAccount->email ? $beneficiaryAccount->email : $user->email,
            'mobile_country_code' => $beneficiaryAccount->mobile_country_code ?: $user->mobile_country_code,
            'mobile' => $beneficiaryAccount->mobile ?: $user->mobile,
        ];

        if ($sync) {

            $validation = $beneficiaryAccount->validation ?? null;

            $beneficiary['is_nre_account'] = is_null($validation) ? 0 : ($validation->is_nre_account == 1 ? 1 : 2);

            $beneficiary['is_account_exists'] = is_null($validation) ? 0 : ($validation->is_account_exists == 1 ? 1 : 2);

            $beneficiary['account_validation_data'] = $validation->external_data ?? new stdClass();
        }

        if (!$sender) {

            if ($user->user_type == USER_TYPE_INDIVIDUAL) {

                $remitter = [
                    'type' => $user->user_type == USER_TYPE_INDIVIDUAL ? 'INDIVIDUAL' : 'BUSINESS',
                    'first_name' => $user->first_name,
                    'last_name' => $user->last_name ? $user->last_name : $user->first_name,
                    'country' => $user->userInformation->country,
                    'email' => $user->email,
                    'mobile_country_code' => $user->mobile_country_code,
                    'mobile' => $user->mobile,
                    'dob' => $user->dob,
                    'nationality' => $user->userInformation->country,
                    'address_1' => $user->userInformation->address_1,
                    'address_2' => $user->userInformation->address_2,
                    'city' => $user->userInformation->city,
                    'state' => $user->userInformation->state,
                    'postal_code' => $user->userInformation->postal_code,
                    'id_type' => $user->userInformation->id_type ? Lookup::findValuebyKey($user->userInformation->id_type, 'id_types') : null,
                    'id_number' => $user->userInformation->id_number,
                    'source_of_funds' => $user->userInformation->source_of_income,
                ];
            } else {

                $sender_documents = UserDocument::where('user_id', $user->id)->first();

                $remitter = [
                    'type' => $user->type == USER_TYPE_INDIVIDUAL ? 'INDIVIDUAL' : 'BUSINESS',
                    'business_name' => $user->userInformation->business_name,
                    'type_of_business' => $user->userInformation->type_of_business ? Lookup::findValuebyKey($user->userInformation->type_of_business, 'business_types') : "Company",
                    'document_file' => $sender_documents->document_file ?? null,
                    'document_type' => $sender_documents->document_type ? Lookup::findValuebyKey($sender_documents->document_type, 'document_types') : null,
                    'email' => $user->email,
                    'mobile_country_code' => $user->mobile_country_code,
                    'mobile' => $user->mobile,
                    'address_1' => $user->userInformation->address_1,
                    'address_2' => $user->userInformation->address_2,
                    'city' => $user->userInformation->city,
                    'state' => $user->userInformation->state,
                    'postal_code' => $user->userInformation->postal_code,
                    'id_type' => $user->userInformation->id_type ? Lookup::findValuebyKey($user->userInformation->id_type, 'id_types') : null,
                    'id_number' => $user->userInformation->id_number,
                    'source_of_funds' => $user->userInformation->source_of_income,
                    'country' => $user->userInformation->country
                ];

                if (!empty($user->userInformation->business_persons)) {

                    $persons = collect($user->userInformation->business_persons);

                    $hasUbo = $persons->contains(function ($person) {
                        return ($person['designation_id'] ?? null) == 5;
                    });


                    if (!$hasUbo) {
                        $persons = $persons->map(function ($person, $index) {
                            if ($index === 0) {
                                $person['designation_id'] = 5;
                            }
                            return $person;
                        });
                    }
                    $remitter['business_persons'] = $persons->map(function ($person) {
                        return [
                            'first_name' => $person['first_name'] ?? null,
                            'last_name' => $person['last_name'] ?? null,
                            'mobile_country_code' => $person['mobile_country_code'] ?? null,
                            'mobile' => $person['mobile'] ?? null,
                            'country' => $person['country'] ?? null,
                            'id_type' => !empty($person['id_type'])
                                ? Lookup::findValuebyKey($person['id_type'], 'id_types')
                                : null,
                            'id_number' => $person['id_number'] ?? null,
                            'designation' => isset($person['designation_id']) ? Lookup::findValuebyKey($person['designation_id'], 'professions') : null
                        ];
                    })->values()->toArray();
                }
            }

        } else {

            if ($sender->type == USER_TYPE_INDIVIDUAL) {

                $remitter = [
                    'type' => 'INDIVIDUAL',
                    'title' => $sender->title,
                    'first_name' => $sender->first_name,
                    'last_name' => $sender->last_name ? $sender->last_name : $sender->first_name,
                    'country' => $sender->country,
                    'email' => $sender->email ? $sender->email : $user->email,
                    'mobile_country_code' => $sender->mobile_country_code ? $sender->mobile_country_code : $user->mobile_country_code,
                    'mobile' => $sender->mobile ? $sender->mobile : $user->mobile,
                    'dob' => $sender->dob,
                    'nationality' => $sender->nationality ? $sender->nationality : $sender->country,
                    'address_1' => $sender->address_1,
                    'address_2' => $sender->address_2,
                    'city' => $sender->city ? $sender->city : $user->userInformation->city,
                    'state' => $sender->state,
                    'postal_code' => $sender->postal_code,
                    'id_type' => $sender->id_type ? Lookup::findValuebyKey($sender->id_type, 'id_types') : null,
                    'id_number' => $sender->id_number,
                    'source_of_funds' => $sender->source_of_funds,
                ];
            } else {

                $sender_documents = SenderDocument::where('sender_id', $sender->id)->first();

                $remitter = [
                    'type' => 'BUSINESS',
                    'business_name' => $sender->first_name,
                    'type_of_business' => $user->userInformation->type_of_business ? Lookup::findValuebyKey($user->userInformation->type_of_business, 'business_types') : "Company",
                    'document_file' => $sender_documents->document_file ?? null,
                    'document_type' => $sender_documents->document_type ? Lookup::findValuebyKey($sender_documents->document_type, 'document_types') : null,
                    'email' => $sender->email,
                    'mobile_country_code' => $sender->mobile_country_code,
                    'mobile' => $sender->mobile,
                    'address_1' => $sender->address_1,
                    'address_2' => $sender->address_2,
                    'city' => $sender->city,
                    'state' => $sender->state,
                    'postal_code' => $sender->postal_code,
                    'id_type' => $sender->id_type ? Lookup::findValuebyKey($sender->id_type, 'id_types') : null,
                    'id_number' => $sender->id_number,
                    'source_of_funds' => $sender->source_of_funds,
                    'country' => $sender->country
                ];

                if (!empty($sender->business_persons)) {

                    $persons = collect($sender->business_persons);

                    $hasUbo = $persons->contains(function ($person) {
                        return ($person['designation_id'] ?? null) == 5;
                    });

                    if (!$hasUbo) {
                        $persons = $persons->map(function ($person, $index) {
                            if ($index === 0) {
                                $person['designation_id'] = 5;
                            }
                            return $person;
                        });
                    }

                    $remitter['business_persons'] = $persons->map(function ($person) {
                        return [
                            'first_name' => $person['first_name'] ?? null,
                            'last_name' => $person['last_name'] ?? null,
                            'mobile_country_code' => $person['mobile_country_code'] ?? null,
                            'mobile' => $person['mobile'] ?? null,
                            'country' => $person['country'] ?? null,
                            'id_type' => !empty($person['id_type'])
                                ? Lookup::findValuebyKey($person['id_type'], 'id_types')
                                : null,
                            'id_number' => $person['id_number'] ?? null,
                            'designation' => $person['designation_id'] ? Lookup::findValuebyKey($person['designation_id'], 'professions') : null
                        ];
                    })->values()->toArray();
                }
            }
        }


        if ($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYOUT) {

            $MerchantAccount = $user->merchant->settings()
                ->where('key', 'caliza_account_id')
                ->select('value')
                ->first();

            if ($MerchantAccount) {
                $external_reference_id = $MerchantAccount->value;
            } else {

                $virtuaAccount = VirtualAccount::forUser($user)->first();

                throw_if(!$virtuaAccount, new Exception(api_error(120), 120));

                $external_reference_id = $virtuaAccount->external_reference_id;
            }
        } else {
            $userservice = $user->userServices()
                ->where('service_type', EXTERNAL_TYPE_CALIZA)
                ->where('is_active', ACTIVE)
                ->select('external_reference_id')
                ->first();

            throw_if(!$userservice, new Exception(api_error(113), 113));

            $external_reference_id = $userservice->external_reference_id;
        }
        $data = [
            ...$common,
            'beneficiary' => $beneficiary,
            'remitter' => $remitter,
            'merchant' => [
                'name' => $txn->user->merchant ? $txn->user->merchant->name : $txn->user->name,
                'email' => $txn->user->merchant ? $txn->user->merchant->email : $txn->user->email
            ],
            'meta_data' => [
                'user_reference_id' => $external_reference_id ?? null,
                'beneficiary_reference_id' => $beneficiaryAccount->external_reference_id ?? null,
                'search_reference_id' => $txn->client_reference_id ?? $txn->txn_ref_no ?? null,
            ],
        ];

        return $this->removeEmptyValues($data);
    }
    private function removeEmptyValues(array $data): array
    {
        foreach ($data as $key => $value) {

            if (is_array($value)) {

                $value = $this->removeEmptyValues($value);

                if (empty($value)) {
                    unset($data[$key]);
                    continue;
                }

                $data[$key] = $value;
                continue;
            }

            if ($value === null || $value === '') {
                unset($data[$key]);
            }
        }

        return $data;
    }

    public function createDeposit($txn)
    {
         try {

            $transactionPayload = $this->prepareDepositPayload($txn);

            $service = new DepositTransactionService();

            $response = $service->create($txn, $transactionPayload);

            if (isset($response['success']) && $response['success']) {

                $status = $response['data']['deposit_transaction']['status'] ?? null;

                if ($status) {

                    $statusData = ProcessingUnit_Depositstatus_map($status);

                    $mappedStatus = $statusData['mapped'];

                    if ($txn->status !== $mappedStatus) {

                        $txn->update([
                            'status' => $mappedStatus
                        ]);
                    }

                    Log::info("Processing Unit response", [
                        'response' => $response ,
                        'order_id' => $txn->order_id,
                        'incoming_status' => $status,
                        'mapped_status' => $mappedStatus
                    ]);
                }
            }else{
                Log::error("Processing Unit deposit initiation failed", [
                    'txn_id' => $txn->id,
                    'Processing Unit response' => $response
                ]);

                $txn->update([
                    'status' => DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED
                ]);
            }
        } catch (Exception $e) {

            return null;
        }
    }
    private function prepareDepositPayload($txn)
    {

        $sourceFunds = deposit_source_of_fund();

        $purposes = deposit_purpose();

        $data = [
            'merchant' => [
                'name' => $txn->user->merchant ? $txn->user->merchant->name : $txn->user->name,
                'email' => $txn->user->merchant ? $txn->user->merchant->email : $txn->user->email
            ],
            'order_id' => $txn->unique_id,
            'country' => $txn->virtualAccount->country,
            'currency' => $txn->virtualAccount->currency,
            'account_number' => $txn->virtualAccount->account_number,
            'account_holder_name' => $txn->virtualAccount->account_holder_name,
            'account_holder_address' => $txn->virtualAccount->account_holder_address,
            'account_bank_name' => $txn->virtualAccount->account_bank_name,
            'account_bank_code' => $txn->virtualAccount->account_bank_code,
            'account_bank_address' => $txn->virtualAccount->account_bank_address,
            'routing_number' => $txn->virtualAccount->routing_number,
            'amount' => $txn->total_amount,
            'type' => $txn->type,
            'source_of_funds' => $sourceFunds[$txn->source_of_funds] ?? '',
            'purpose_of_payment' => $purposes[$txn->purpose_of_payment] ?? '',
            'proof' => $txn->proof ?? null,
            'deposit_currency_type' => $txn->deposit_currency ? (in_array($txn->deposit_currency, [CURRENCY_USDC, CURRENCY_USDT]) ? 'CRYPTO' : 'FIAT') : null,
            'network_type' => $txn->admin_wallet_id ? $txn->adminWallet->network : null,
            'from_wallet_address' => $txn->from_wallet_address ?? null,
            'to_wallet_Address' => $txn->admin_wallet_id ? $txn->adminWallet->wallet_address : null,
            'transaction_hash' => $txn->transaction_hash ?? null,
        ];

        return $this->removeEmptyValues($data);
    }

    public function validateAccount($payload)
    {
        try {

            $service = new BeneficiaryTransactionService();

            $response = $service->validateAccount($payload);

            return $response;
        } catch (Exception $e) {

            return null;
        }
    }
}
