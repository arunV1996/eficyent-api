<?php

namespace App\Repositories;

use App\Enums\TelegramEvent;
use App\Exports\BeneficiaryTransactionsDataExport;
use App\Exports\BulkTemplateExport;
use App\ExternalServices\Compliance\CompilanceService;
use App\ExternalServices\InvoiceMate\InvoiceMate;
use App\ExternalServices\Compliance\ComplianceService;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;
use App\Factories\BeneficiaryTransaction\BeneficiaryTransactionFactory;
use App\Factories\Quotes\QuoteSourceFactory;
use App\Helpers\FieldsHelper;
use App\Models\BeneficiaryAccount;
use App\Models\BeneficiaryTransaction;
use App\Models\Quote;
use App\Models\Sender;
use App\Models\VirtualAccount;
use App\Helpers\Helper;
use App\Helpers\TelegramHelper;
use App\Http\Resources\BeneficiaryTransactionResource;
use App\Jobs\ProcessBulkPayout;
use App\Jobs\SendCallbackJob;
use App\Jobs\SendToInvoiceMateJob;
use App\Models\BeneficiaryTransactionProof;
use App\Models\MerchantSetting;
use App\Models\PayoutJob;
use App\Models\TeamMember;
use App\Models\Wallet;
use App\Services\Callbacks\CallbackDispatcher;
use App\Services\ImportService\ExcelImportService;
use App\Services\Telegram\TelegramNotifier;
use App\Validators\BeneficiaryValidator;
use App\Validators\ImportQuoteValidator;
use App\Validators\SenderValidator;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;
use Throwable;
use Mpdf\Mpdf;
use Akaunting\Setting\Facade as Setting;

class BeneficiaryTransactionRepository
{
    public function list(Request $request, $user, $getAll = false, $team_member = null)
    {
        $status = null;

        if($request->filled('status')){

            $status = beneficiary_transaction_status_map()[$request->status] ?? null;
        }
        $date_filter = null;

        if ($request->filled('from_date') && $request->filled('to_date')) {
            $from = Carbon::createFromFormat('Y-m-d', $request->from_date)->format('Y-m-d');
            $to   = Carbon::createFromFormat('Y-m-d', $request->to_date)->format('Y-m-d');

            $date_filter = ['from' => $from, 'to' => $to];
        }

        $bank_account_id = null;

        if ($request->filled('bank_account_id')) {

            $virtual_account = VirtualAccount::forUser($user)
                ->where('unique_id', $request->bank_account_id)
                ->first();

            throw_if(!$virtual_account, new Exception(api_error(120), 120));

            $bank_account_id = $virtual_account->id;
        }

        $wallet_id = null;

        if ($request->filled('wallet_id')) {

            $wallet = Wallet::where('user_id', $user->id)
                ->where('unique_id', $request->wallet_id)
                ->first();

            throw_if(!$wallet, new Exception(api_error(167), 167));

            $wallet_id = $wallet->id;
        }

        $baseQuery = BeneficiaryTransaction::where('user_id', $user->id)
            ->when($request->filled('search_key'), function ($query) use ($request) {

                $key = '%' . $request->search_key . '%';

                $query->where(function ($q) use ($key) {

                    $q->where('unique_id', 'like', $key)
                        ->orWhere('txn_ref_no', 'like', $key)
                        ->orWhere('status', 'like', $key)
                        ->orWhere('remarks', 'like', $key)
                        ->orWhere('external_reference_id', 'like', $key)

                        ->orWhereHas('beneficiaryAccount', function ($qa) use ($key) {
                            $qa->where('account_number', 'like', $key)
                                ->orWhere('bank_name', 'like', $key)
                                ->orWhere('swift_code', 'like', $key)
                                ->orWhere('routing_number', 'like', $key)
                                ->orWhere('account_name', 'like', $key)
                                ->orWhere('first_name', 'like', $key)
                                ->orWhere('last_name', 'like', $key)
                                ->orWhere('business_name', 'like', $key);
                        });
                });
            })
            ->when(!is_null($status), function ($query) use ($request, $status) {
                if ($status == BENEFICIARY_TRANSACTION_PROCESSING) {
                    $statuses = [
                        BENEFICIARY_TRANSACTION_APPROVED,
                        BENEFICIARY_TRANSACTION_INITIATED,
                        BENEFICIARY_TRANSACTION_PROCESSING,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
                        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
                        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED
                    ];
                    $query->whereIn('status', $statuses);
                } else if ($status == BENEFICIARY_TRANSACTION_FAILED) {
                    $statuses = [
                        BENEFICIARY_TRANSACTION_FAILED,
                        BENEFICIARY_TRANSACTION_EXPIRED,
                        BENEFICIARY_TRANSACTION_CANCELLED,
                        BENEFICIARY_TRANSACTION_REJECTED
                    ];
                    $query->whereIn('status', $statuses);
                } else {
                    $query->where('status', $status);
                }
            })
            ->when($date_filter, function ($query) use ($date_filter) {
                $query->whereBetween(
                    DB::raw('DATE(created_at)'),
                    [$date_filter['from'], $date_filter['to']]
                );
            })
            ->when($bank_account_id, function ($query) use ($bank_account_id) {
                $query->whereHas('quote', function ($q) use ($bank_account_id) {
                    $q->where('source_id', $bank_account_id);
                });
            })
            ->when($wallet_id, function ($query) use ($wallet_id) {
                $query->whereHas('quote', function ($q) use ($wallet_id) {
                    $q->where('source_id', $wallet_id);
                });
            });

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $baseQuery = $baseQuery->where('team_member_id', $team_member->id);
        }

        $baseQuery = $baseQuery->orderBy('created_at', 'desc');

        $total = $baseQuery->count();

        if($getAll){

            $beneficiary_transactions = $baseQuery->get();
        }else{

            list($skip, $take) = [ $request->skip ?? 0, $request->take ?? TAKE_COUNT];

            $beneficiary_transactions = $baseQuery->skip($skip)->take($take)->get();
        }

        return [
            'total' => $total,
            'beneficiary_transactions' => $beneficiary_transactions
        ];
    }
    public function create(array $validated, $user, $creator = null)
    {

        if(isset($validated['client_reference_id'])){

            $check_reference_id = BeneficiaryTransaction::where('user_id', $user->id)->where('client_reference_id', $validated['client_reference_id'])->first();

            throw_if($check_reference_id, new Exception(api_error(187), 187));
        }


        $final_status = BENEFICIARY_TRANSACTION_APPROVED;

        if ($creator) {

            if ($creator->role == TEAM_MEMBER_ROLE_SUPPORT_MEMBER) {

                $final_status = BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;
            }

            if( $creator->role == TEAM_MEMBER_ROLE_CORPORATE) {

                $final_status = BENEFICIARY_TRANSACTION_CORPORATE_INITIATED;

                $sender = $creator->sender;

                throw_if(!$sender, new Exception(api_error(132), 132));

                $validated['remitter_id'] = $sender->id;

            }
        }

        $quote = Quote::where('unique_id', $validated['quote_id'])
            ->where('user_id', $user->id)->first();

        throw_if(!$quote, new Exception(api_error(121), 121));

        throw_if($quote->status == QUOTE_SUBMITTED, new Exception(api_error(153), 153));

        $beneficiary_account = BeneficiaryAccount::where('unique_id', $validated['beneficiary_account_id'])
            ->where('user_id', $user->id)->first();

        throw_if(!$beneficiary_account, new Exception(api_error(118), 118));

        throw_if($beneficiary_account->currency != $quote->receiving_currency, new Exception(api_error(180), 180));

        // if($beneficiary_account->currency == "INR"){

        //     Helper::validateBankAccountINR($user, $beneficiary_account);
        // }

        $quoteSource = QuoteSourceFactory::resolve($quote->source_type, $quote->source_id, $user);

        if ($quoteSource instanceof VirtualAccount) {

            $check_balance = Helper::bankBalance($user, $quoteSource, $creator);
        }else{

            throw_if($quoteSource->status != WALLET_STATUS_ACTIVE, new Exception(api_error(169), 169));

            $check_balance = Helper::getWalletBalance($quoteSource, $user);
        }

        $sender = null;

        if (!empty($validated['remitter_id'])) {

            throw_if(!$user->enable_sender, new Exception(api_error(143), 143));

            $sender = Sender::where('unique_id', $validated['remitter_id'])
                ->where('user_id', $user->id)->first();

            throw_if(!$sender, new Exception(api_error(132), 132));

            throw_if($sender->status == SENDER_STATUS_DISABLED, new Exception(api_error(203), 203));

            if ($beneficiary_account->currency == "PKR" && $sender->nationality == "IND") {

                throw (new Exception(api_error(200), 200));
            }

            // if(Helper::is_remitter_deposit_enabled($user)) {

            //     throw_if(!$sender->client_reference_id, new Exception(api_error(173), 173));

            //     $check_balance = Helper::Get_Remitter_Balance($sender, $user);
            // }

            $validated['remitter_id'] = $sender->id;
        }

        if (!Helper::is_remitter_deposit_enabled($user)) {

            throw_if($check_balance < $quote->amount, new Exception(api_error(154), 154));
        }


        $fees = $quote->commission_amount + $quote->external_commission_amount + $quote->merchant_commission_amount;

        $fileName = null;

        if (isset($validated['supporting_document']) && !empty($validated['supporting_document'])) {

            $fileName = upload_files($validated['supporting_document']);
        }

        if(isset($validated['txn_ref_no']) && !empty($validated['txn_ref_no'])) {

            $check = BeneficiaryTransaction::where('txn_ref_no', $validated['txn_ref_no'])->first();

            throw_if($check, new Exception(api_error(196), 196));

            $transaction_reference_number = $validated['txn_ref_no'];
        }else{

            $transaction_reference_number = Helper::generateTransactionRefNumber($user);
        }
        $transaction_response = [
            'txn_ref_no' => $transaction_reference_number,
            'user_id' => $user->id,
            'sender_id' => $validated['remitter_id'] ?? null,
            'quote_id' => $quote->id,
            'beneficiary_account_id' => $beneficiary_account->id,
            'supporting_document' => $fileName,
            'amount' => $quote->amount,
            'commission_amount' => $fees,
            'total_amount' => $quote->amount + $fees,
            'recipient_amount' => $quote->receiving_amount,
            'receiving_currency' => $quote->receiving_currency,
            'remarks' => $validated['remarks'] ?? null,
            'external_type' => $quote->external_type,
            'status' => $final_status,
            'purpose_of_payment' => $validated['purpose_of_payment'] ?? null
        ];

        if (isset($validated['client_reference_id'])) {

            $transaction_response['client_reference_id'] = $validated['client_reference_id'];
        }

        return DB::transaction(function () use ($quote, $transaction_response) {

            $txn = BeneficiaryTransaction::create($transaction_response);

            throw_if(!$txn, new Exception(api_error(123), 123));

            Helper::updateLedger($txn);

            $quote->update(['status' => QUOTE_SUBMITTED]);

            DB::afterCommit(function () use ($txn) {

                TelegramNotifier::notify(TelegramEvent::BENEFICIARY_TRANSACTION_CREATED, $txn);
            });

            // SendToInvoiceMateJob::dispatch($txn);

            Helper::processTransaction($txn);

            return $txn->refresh();
        });
    }

    public function show($user, string $uniqueId)
    {
        $transaction = BeneficiaryTransaction::where('user_id', $user->id)
            ->where(function ($query) use ($uniqueId) {
                $query->where('unique_id', $uniqueId)
                    ->orWhere('txn_ref_no', $uniqueId)
                    ->orWhere('client_reference_id', $uniqueId);
            })
            ->first();

        return $transaction;
    }


    public function checkStatus($user, $validated)
    {
        $beneficiary_transaction =  BeneficiaryTransaction::where('user_id', $user->id)
            ->where(function ($query) use ($validated) {
                $query->where('unique_id', $validated['beneficiary_transaction_id'] ?? null)
                    ->orWhere('txn_ref_no', $validated['beneficiary_transaction_id'] ?? null)
                    ->orWhere('client_reference_id', $validated['beneficiary_transaction_id'] ?? null);
            })
            ->first();

        throw_if(!$beneficiary_transaction, new Exception(api_error(124), 124));

        // if ($beneficiary_transaction->status == BENEFICIARY_TRANSACTION_INITIATED || $beneficiary_transaction->status == BENEFICIARY_TRANSACTION_PROCESSING) {

        //     $beneficiary_transaction_factory = new BeneficiaryTransactionFactory();

        //     $transactionService = $beneficiary_transaction_factory->resolve($beneficiary_transaction->external_type);

        //     $beneficiary_transaction = $transactionService->checkstatus($beneficiary_transaction);

        //     if ($beneficiary_transaction->status == BENEFICIARY_TRANSACTION_COMPLETED) {

        //         SendCallbackJob::dispatch(
        //             $beneficiary_transaction->user,
        //             CALLBACK_PAYOUT_SUCCESS,
        //             (new BeneficiaryTransactionResource($beneficiary_transaction))->additional(['resource_method' => CALLBACK_RESPONSE])
        //         );
        //     }
        // }

        return $beneficiary_transaction;
    }

    public function downloadReceipt($user, $validated)
    {
        $beneficiary_transaction = BeneficiaryTransaction::where('unique_id', $validated['beneficiary_transaction_id'])->where('user_id', $user->id)->first();

        Log::info("Download receipt", ['beneficiary_transaction_id' => $validated['beneficiary_transaction_id'], 'user_id' => $user->id]);

        throw_if(!$beneficiary_transaction, new Exception(api_error(124), 124));

        $invoice_details = [
            'unique_id' => $beneficiary_transaction->unique_id,
            'created_at' => common_date($beneficiary_transaction->created_at, DEFAULT_TIMEZONE),
            'name' => $beneficiary_transaction->sender
                ? ($beneficiary_transaction->sender->first_name ?? '') . ' ' . ($beneficiary_transaction->sender->last_name ?? '')
                : ($beneficiary_transaction->user->user_type == USER_TYPE_INDIVIDUAL
                    ? trim(($beneficiary_transaction->user->first_name ?? '') . ' ' . ($beneficiary_transaction->user->last_name ?? ''))
                    : ($beneficiary_transaction->user->userInformation->business_name ?? '')
                ),
            'amount' => $beneficiary_transaction->recipient_amount,
            'currency' => $beneficiary_transaction->receiving_currency ?? "",
            'purpose_of_payment' => $beneficiary_transaction->beneficiaryAccount->beneficiaryAccountAdditionalDetail->purpose_of_transaction ?? "",
            'fx_rate' => $beneficiary_transaction->quote->fx_rate ?? "",
            'status' => beneficiary_transaction_status_label($beneficiary_transaction->status),
            'remarks' => $beneficiary_transaction->remarks ?? "",
            'beneficiary_name' => $beneficiary_transaction->beneficiaryAccount->type == USER_TYPE_INDIVIDUAL ? ($beneficiary_transaction->beneficiaryAccount->first_name . ' ' . $beneficiary_transaction->beneficiaryAccount->last_name) : $beneficiary_transaction->beneficiaryAccount->business_name ?? "",
            'account_number' => $beneficiary_transaction->beneficiaryAccount->account_number ?? "",
            'bank_name' => $beneficiary_transaction->beneficiaryAccount->bank_name ?? "",
            "bank_code" => $beneficiary_transaction->beneficiaryAccount->swift_code ?? "",
            "routing_number" => $beneficiary_transaction->beneficiaryAccount->routing_number ?? "",
            "sender_name" => $beneficiary_transaction->sender ? ($beneficiary_transaction->sender->first_name . ' ' . $beneficiary_transaction->sender->last_name) : $beneficiary_transaction->user->name,
            "sender_address" => $beneficiary_transaction->sender ? $beneficiary_transaction->sender->address_1 : $beneficiary_transaction->user->userInformation->address_1,
            "sender_city" => $beneficiary_transaction->sender ? $beneficiary_transaction->sender->city : $beneficiary_transaction->user->userInformation->city,
            "sender_state" => $beneficiary_transaction->sender ? $beneficiary_transaction->sender->state : $beneficiary_transaction->user->userInformation->state,
            "sender_postal_code" => $beneficiary_transaction->sender ? $beneficiary_transaction->sender->postal_code : $beneficiary_transaction->user->userInformation->postal_code,
            "sender_country" => $beneficiary_transaction->sender ? get_country_name($beneficiary_transaction->sender->country) : get_country_name($beneficiary_transaction->user->userInformation->country),
            "utr_no" => (string) $beneficiary_transaction->external_reference_id ?? "",
            "txn_ref_no" =>(string) $beneficiary_transaction->txn_ref_no ?? "",
        ];

        $html = view('pdf.transaction_receipt', compact('invoice_details'))->render();

        $tempDir = storage_path('app/mpdf-temp');

        if (!file_exists($tempDir)) {

            mkdir($tempDir, 0775, true);
        }

        $mpdf = new Mpdf(['tempDir' => $tempDir]);

        $merchantSetting = MerchantSetting::where('merchant_id', $user->merchant->id ?? 0)->where('key', 'password_enabled')->first();

        if ($merchantSetting && $merchantSetting->value == '1') {

            $mobileLast4 = substr(preg_replace('/\D/', '', $user->mobile ?? '0000'), -4);

            if ($user->user_type == USER_TYPE_INDIVIDUAL) {
                $name = trim(($user->first_name ?? '') . ($user->last_name ?? ''));
            } else {
                $name = $user->userInformation->business_name ?? '';
            }

            $name = preg_replace('/[^A-Za-z0-9]/', '', $name);

            $nameLast4 = substr($name, -4);

            $password = $mobileLast4 . $nameLast4;

            $mpdf->SetProtection(['print'], $password, null);
        }

        $mpdf->WriteHTML($html);

        $file_path = TRANSACTION_RECEIPT_FILE_PATH . $beneficiary_transaction->unique_id . '_' . now()->timestamp . '.pdf';

        $directory = dirname($file_path);

        if (!Storage::disk('public')->exists($directory)) {

            Storage::disk('public')->makeDirectory($directory);
        }

        Storage::disk('public')->put($file_path, $mpdf->Output('', 'S'));

        return url(Storage::url($file_path));
    }

    public function cancel($beneficiary_transactions, $validated = [])
    {
        $success = [];
        $failed  = [];

        foreach ($beneficiary_transactions as $txn) {

            try {

                $beneficiary_transaction = DB::transaction(function () use ($txn, $validated) {

                    $beneficiary_transaction = $txn->newQuery()
                        ->whereKey($txn->id)
                        ->lockForUpdate()
                        ->first();

                    throw_if(
                        $beneficiary_transaction->status >= BENEFICIARY_TRANSACTION_INITIATED,
                        new Exception(api_error(155), 155)
                    );

                    $beneficiary_transaction->update([
                        'status' => BENEFICIARY_TRANSACTION_CANCELLED,
                        'notes'  => $validated['remarks'] ?? null,
                    ]);

                    Helper::create_refund($beneficiary_transaction);

                    return $beneficiary_transaction->refresh();
                });

                $success[] = [
                    'unique_id' => $beneficiary_transaction->unique_id,
                ];
            } catch (Exception $e) {

                $failed[] = [
                    'unique_id' => $txn->unique_id,
                    'message'   => $e->getMessage(),
                ];
            }
        }

        return [
            'updated_count'       => count($success),
            'success_transactions' => $success,
            'failed_count'        => count($failed),
            'failed_transactions' => $failed,
        ];
    }


    public function updateStatus($beneficiary_transactions, $validated, $team_member = null)
    {
        $status = $validated['status'];

        $success = [];

        $failed = [];

        foreach ($beneficiary_transactions as $beneficiary_transaction) {

            try {

                throw_if(!$beneficiary_transaction, new Exception(api_error(124), 124));

                if($team_member && $team_member->permission == TEAM_MEMBER_PERMISSION_MAKER){

                    throw_if($beneficiary_transaction->status != BENEFICIARY_TRANSACTION_CORPORATE_INITIATED, new Exception(api_error(162), 162));

                    $status = BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL;

                }else{

                    throw_if(!in_array($beneficiary_transaction->status, [BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL, BENEFICIARY_TRANSACTION_CORPORATE_INITIATED]), new Exception(api_error(162), 162));

                }

                $beneficiary_transaction = DB::transaction(function () use ($beneficiary_transaction, $status, $validated) {

                    $beneficiary_transaction = $beneficiary_transaction->newQuery()
                        ->whereKey($beneficiary_transaction->id)
                        ->lockForUpdate()
                        ->first();

                    $beneficiary_transaction->update([
                        'status' => $status,
                        'notes' => $validated['remarks'] ?? null,
                    ]);

                    if ($status == BENEFICIARY_TRANSACTION_REJECTED) {

                        Helper::create_refund($beneficiary_transaction);
                    }

                    DB::afterCommit(function () use ($beneficiary_transaction) {

                        TelegramNotifier::notify(TelegramEvent::BENEFICIARY_TRANSACTION_CREATED, $beneficiary_transaction);

                        Helper::processTransaction($beneficiary_transaction);

                    });
                    return $beneficiary_transaction->refresh();
                });



                $success[] = [
                    'unique_id' => $beneficiary_transaction->unique_id
                ];
            } catch (Exception $e) {

                $failed[] = [
                    'unique_id' => $beneficiary_transaction->unique_id,
                    'message' => $e->getMessage()
                ];
            }
        }

        $data['updated_count'] = count($success);

        $data['failed_count'] = count($failed);

        $data['failed_transactions'] = $failed;

        $data['success_transactions'] = $success;

        return $data;
    }

    public function export_list($beneficiary_transactions, $type = 1)
    {

        $export_details = [];

        if (!empty($beneficiary_transactions['beneficiary_transactions'])) {

            foreach ($beneficiary_transactions['beneficiary_transactions'] as $beneficiary_transaction) {

                $export_details[] = [
                    'txn_ref_no' => (string)$beneficiary_transaction->txn_ref_no ?? '',
                    'client_ref_no' => (string)$beneficiary_transaction->client_reference_id ?? '',
                    'unique_id' => (string)$beneficiary_transaction->unique_id,
                    'sending_amount' => $beneficiary_transaction->total_amount,
                    'receiving_amount' => $beneficiary_transaction->recipient_amount,
                    'sending_currency' => $beneficiary_transaction->quote->source->currency,
                    'receiving_currency' => $beneficiary_transaction->receiving_currency,
                    'fx_rate' => format_fx_rate($beneficiary_transaction->quote),

                    'commission_amount' => $beneficiary_transaction->commission_amount,
                    'remitter_id' => $beneficiary_transaction->sender_id ?? '',
                    'remitter_name' => $beneficiary_transaction->sender->name ?? '',
                    'beneficiary_id' => $beneficiary_transaction->beneficiaryAccount->id ?? '',
                    'beneficiary_name' => $beneficiary_transaction->beneficiaryAccount->name ?? '',
                    'account_number' => (string)$beneficiary_transaction->beneficiaryAccount->account_number ?? '',

                    'status' => beneficiary_transaction_status_label($beneficiary_transaction->status),
                    'remarks' => $beneficiary_transaction->remarks ?? '',
                    'created_at' => common_date($beneficiary_transaction->created_at, $user->timezone ?? DEFAULT_TIMEZONE, 'd M Y h:i:s A')
                ];
            }
        }

        $user = auth()->user();

        $timestamp = now()->format('Ymd_His');

        $fileNameBase = "bank-statement_{$timestamp}";

        if($type == EXPORT_TYPE_PDF) {

            $fileName = $fileNameBase . '.pdf';

            $tempDir = storage_path('app/mpdf-temp');

            if (!file_exists($tempDir)) {

                mkdir($tempDir, 0775, true);
            }

            $html = view('pdf.beneficiary_transactions', compact('export_details'))->render();

            $mpdf = new \Mpdf\Mpdf(['tempDir' => $tempDir]);

            $merchantSetting = MerchantSetting::where('merchant_id', $user->merchant->id ?? 0)->where('key', 'password_enabled')->first();

            if ($merchantSetting && $merchantSetting->value == '1') {

                $mobileLast4 = substr(preg_replace('/\D/', '', $user->mobile ?? '0000'), -4);

                if ($user->user_type == USER_TYPE_INDIVIDUAL) {

                    $name = trim(($user->first_name ?? '') . ($user->last_name ?? ''));

                } else {

                    $name = $user->userInformation->business_name ?? '';
                }

                $name = preg_replace('/[^A-Za-z0-9]/', '', $name);

                $nameLast4 = substr($name, -4);

                $password = $mobileLast4 . $nameLast4;

                $mpdf->SetProtection(['print'], $password, null);
            }

            $mpdf->WriteHTML($html);

            Storage::disk('public')->put($fileName, $mpdf->Output('', 'S'));

        } else {

            $fileName = $fileNameBase . '.xlsx';

            $excel = Excel::store(new BeneficiaryTransactionsDataExport($export_details), $fileName, 'public');

            throw_if(!$excel, new Exception(api_error(165), 165));
        }

         $url = url(Storage::url($fileName));

         return $url;
    }

    public function template($user, $validated)
    {

        $quote_form  = FieldsHelper::QuoteFormFields() ?? [];

        if($validated['beneficiary_type']){

            $validated['type'] = $validated['beneficiary_type'];
        }

        $beneficiary_form =  FieldsHelper::beneficiary_form_fields($validated, $user) ?? [];

        $form = [
            'quote' => $quote_form,
            'beneficiary' => $beneficiary_form,
        ];

        if ($user->enable_sender == 1) {

            $sender_form = FieldsHelper::sender_fields($validated['remitter_type'], $user) ?? [];

            $form['remitter'] = $sender_form;
        }

        $fields = Helper::flattenFormFields($form);

        $fields = collect($fields)
            ->sortBy(fn($f) => match ($f['section']) {
                'quote' => 0,
                'beneficiary' => 1,
                'remitter' => 2,
            })
            ->values()
            ->all();

        $fileName = 'payout_template_' . now()->timestamp . '.xlsx';

        $filePath = 'payout-templates/' . $fileName;

        Excel::store(
            new BulkTemplateExport($fields),
            $filePath,
            'public'
        );

        $url = Storage::disk('public')->url($filePath);

        return $url;
    }

    public function bulk_store($user, $validated, $file, $creator = null)
    {

        $quote_form       = FieldsHelper::QuoteFormFields() ?? [];

        $beneficiary_form = FieldsHelper::beneficiary_form_fields($validated, $user) ?? [];

        $form = [
            'quote'       => $quote_form,
            'beneficiary' => $beneficiary_form,
        ];

        // if($user->enable_sender == 1) {

            $sender_form      = FieldsHelper::sender_fields($validated['type'], $user) ?? [];

            $form['remitter'] = $sender_form;
        // }

        $fields = Helper::flattenFormFields($form);

        $result = ExcelImportService::process(
            $file,
            $fields,
            function ($payload, $rowNumber) use ($validated, $user) {

                $payload['beneficiary']['country']  = $validated['country'];
                $payload['beneficiary']['currency'] = $validated['currency'];

                $response = [
                    'row' => $rowNumber,
                    'beneficiary' => BeneficiaryValidator::validate($payload['beneficiary'], $user),
                    'quote'       => ImportQuoteValidator::validate($payload['quote'], $user),
                ];

                // if ($user->enable_sender == 1) {

                    $payload['remitter']['country']     = $validated['country'];

                    $response['remitter'] = SenderValidator::validate($payload['remitter'], $user);
                // }

                return $response;
            }
        );

        if (!empty($result['errors'])) {

            return [
                'created' => [],
                'failed'  => $result['errors'],
            ];
        }

        $validatedRows = $result['validatedRows'];

        $rows = collect($validatedRows)->map(function ($row) use ($user) {

            $data = [
                'row'         => $row['row'],
                'beneficiary' => $row['beneficiary'],
                'amount'      => $row['quote']['amount'],
                'remarks'     => $row['quote']['remarks'] ?? null,
                'txn_ref_no'  => $row['quote']['txn_ref_no'] ?? null,
            ];

            // if ((int) $user->enable_sender === 1) {
                $data['remitter'] = $row['remitter'];
            // }

            return $data;
        })->toArray();


        $batchId = $this->dispatchPayoutJobs(
            rows: $rows,
            user: $user,
            batchName: 'Bulk Payout Upload',
            creator: $creator
        );

        return [
            'batch_id' => $batchId,
            'failed'   => [],
        ];
    }

    public function instant_payout($user, $validated)
    {
        $rows = [[
            'beneficiary' => $validated['beneficiary'],
            'remitter'    => $validated['remitter'],
            'amount'      => $validated['quote']['amount'],
            'remarks'     => $validated['quote']['remarks'] ?? null,
            'txn_ref_no'  => $validated['txn_ref_no'] ?? null,
            'row'         => null,
        ]];

        return $this->dispatchPayoutJobs(
            rows: $rows,
            user: $user,
            batchName: 'Instant Payout'
        );
    }

    private function dispatchPayoutJobs(array $rows, $user, string $batchName = 'Payout Processing', $creator = null)
    {

        if (empty($rows)) {
            return null;
        }

        $totalAmount = collect($rows)->sum('amount');

        $virtualAccount = VirtualAccount::forUser($user)->first();

        throw_if(!$virtualAccount, new Exception(api_error(120), 120));

        // $bankBalance = Helper::bankBalance($user, $virtualAccount);

        // throw_if($bankBalance < $totalAmount, new Exception(api_error(154), 154));

        $payoutJobs = collect($rows)->map(function ($row, $index) use ($user, $creator) {

            $payload = [
                'beneficiary' => $row['beneficiary'],
                'remarks'     => $row['remarks'] ?? null,
                'txn_ref_no'  => $row['txn_ref_no'] ?? null,
            ];

            if(isset($row['remitter'])) {

                $payload['remitter'] = $row['remitter'];
            }

            if($creator) {

                $payload['creator'] = $creator->id;
            }

            return PayoutJob::create([
                'user_id'    => $user->id,
                'row_number' => $row['row'] ?? ($index + 1),
                'amount'     => $row['amount'],
                'payload'    => $payload,
                'status'     => PAYOUT_JOB_STATUS_PENDING,
            ]);
        });

        $jobs = $payoutJobs->map(fn($payoutJob) => new ProcessBulkPayout(payoutJobId: $payoutJob->id))->toArray();

        $batch = Bus::batch($jobs)
            ->name($batchName)
            ->onQueue('bulk-payouts')
            ->then(function ($batch) use ($payoutJobs) {
                Log::info('Payout batch completed', [
                    'batch_id' => $batch->id,
                    'total'    => $batch->totalJobs,
                    'failed'   => $batch->failedJobs,
                ]);

                $payoutJobs->each(fn($job) => $job->update(['batch_id' => $batch->id]));
            })
            ->catch(function ($batch, Throwable $e) use ($payoutJobs) {
                Log::error('Payout batch failed', [
                    'batch_id' => $batch->id,
                    'error'    => $e->getMessage(),
                ]);

                $payoutJobs->each(fn($job) => $job->update(['batch_id' => $batch->id]));
            })
            ->dispatch();

        return $batch->id;
    }

    public function requestProof($validated, $user)
    {
        $beneficiaryTransaction = BeneficiaryTransaction::where('unique_id', $validated['beneficiary_transaction_id'])->where('user_id', $user->id)->first();

        throw_if(!$beneficiaryTransaction, new Exception(api_error(124), 124));

        $checkalreadyRequested = BeneficiaryTransactionProof::where('beneficiary_transaction_id', $beneficiaryTransaction->id)->first();

        throw_if($checkalreadyRequested, new Exception(api_error(199), 199));

        $documentType = $beneficiaryTransaction->receiving_currency === 'INR'
            ? PAYMENT_PROOF_FIRA
            : PAYMENT_PROOF_SWIFT;

        if (isset($validated['remitter_proof']) && !empty($validated['remitter_proof'])) {

            $remitter_proof = upload_files($validated['remitter_proof']);
        }

        BeneficiaryTransactionProof::create([
            'beneficiary_transaction_id' => $beneficiaryTransaction->id,
            'user_id'                    => $user->id,
            'document_type'              => $documentType,
            'remitter_proof'             => $remitter_proof ?? null,
            'requested_at'               => now(),
        ]);

        return true;
    }

    public function getProof($validated, $user)
    {
        $beneficiaryTransaction = BeneficiaryTransaction::where('unique_id', $validated['beneficiary_transaction_id'])->where('user_id', $user->id)->first();

        throw_if(!$beneficiaryTransaction, new Exception(api_error(124), 124));

        $checkalreadyRequested = BeneficiaryTransactionProof::where('beneficiary_transaction_id', $beneficiaryTransaction->id)->first();

        throw_if(!$checkalreadyRequested, new Exception(api_error(199), 199));

        return $checkalreadyRequested;
    }
}
