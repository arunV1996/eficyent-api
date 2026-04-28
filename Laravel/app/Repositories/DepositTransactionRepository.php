<?php

namespace App\Repositories;

use App\Enums\TelegramEvent;
use App\Exports\DepositExport;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;
use App\Helpers\CommissionsHelper;
use App\Helpers\Helper;
use App\Http\Resources\DepositTransactionResource;
use App\Http\Resources\LedgerResource;
use App\Models\AdminWallet;
use App\Models\DepositTransaction;
use App\Models\VirtualAccount;
use App\ExternalServices\InvoiceMate\InvoiceMate;
use App\Services\Telegram\TelegramNotifier;
use Barryvdh\DomPDF\Facade\Pdf;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;

class DepositTransactionRepository
{
    public function list($user, Request $request, $getAll = false, $team_member = null): array
    {
        $status = null;
        
        if($request->filled('status')){

            $status = deposit_transaction_status_map()[$request->status] ?? null;
        }

        $baseQuery = DepositTransaction::where('user_id', $user->id)
            ->when($request->filled('from_date') && $request->filled('to_date'), function ($query) use ($request) {
                $query->whereBetween('created_at', [
                    $request->from_date . ' 00:00:00',
                    $request->to_date . ' 23:59:59',
                ]);
            })
            ->when($request->filled('search_key'), function ($query) use ($request) {
                $key = '%' . $request->search_key . '%';

                $query->where(function ($q) use ($key) {
                    $q->where('unique_id', 'like', $key)
                        ->orWhere('external_reference_id', 'like', $key);
                });
            })
            ->when(!is_null($status), function ($query) use ($request, $status) {
                $query->where('status', $status);
            })
            ->when($request->filled('bank_account_id'), function ($query) use ($request, $user) {

                $virtual_account = VirtualAccount::forUser($user)
                    ->where('unique_id', $request->bank_account_id)
                    ->first();

            throw_if(!$virtual_account, new Exception(api_error(120), 120));

                $query->where('virtual_account_id', $virtual_account->id);
            });

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $baseQuery = $baseQuery->where('team_member_id', $team_member->id);
        }
        
        $baseQuery = $baseQuery->orderBy('created_at', 'desc');

        $total = $baseQuery->count();

        if ($getAll) {

            $deposit_transactions = $baseQuery->get();
        } else {
            
            list($skip, $take) = [ $request->skip ?? 0, $request->take ?? TAKE_COUNT];

            $deposit_transactions = $baseQuery->skip($skip)->take($take)->get();
        }

        $baseQuery->orderBy('created_at', 'desc');

        return [
            'total' => $total,
            'deposit_transactions' => $deposit_transactions
        ];
    }

    public function show($user, string $uniqueId)
    {
        return DepositTransaction::where('unique_id', $uniqueId)
            ->where('user_id', $user->id)
            ->first();
    }

    public function export($request, $user, $download_type)
    {
        $deposits = $this->list($user, $request, true);

        $deposit_details = collect($deposits['deposit_transactions'])->map(function ($ledger) use ($request) {
            return (new DepositTransactionResource($ledger, $request))->toArray(null);
        })->toArray();

        $timestamp = now()->format('Ymd_His');

        $fileNameBase = "bank-statement_{$timestamp}";

        if ($download_type == EXPORT_TYPE_PDF) {

            $fileName = $fileNameBase . '.pdf';

            $pdf = Pdf::loadView('pdf.deposits', compact('deposit_details'));

            throw_if(!$pdf, new Exception(api_error(165), 165));

            Storage::disk('public')->put($fileName, $pdf->output());
        } else {

            $fileName = $fileNameBase . '.xlsx';

            $excel = Excel::store(new DepositExport($deposit_details), $fileName, 'public');

            throw_if(!$excel, new Exception(api_error(165), 165));
        }
        $url = url(Storage::url($fileName));

        return $url;
    }

    public function store($user, $validated)
    {

        $virtual_account = VirtualAccount::forUser($user)->where('unique_id', $validated['virtual_account_id'])->first();

        throw_if(!$virtual_account, new Exception(api_error(120), 120));

        $deposit_transaction = DB::transaction(function () use ($validated, $user, $virtual_account) {

            $referenceId = $user->memo ?? null;

            if(!$referenceId){

                $referenceId = Helper::generateUniqueUserMemo($user);

                $user->update([
                    'memo' => $referenceId
                ]);
            }

            $commissions = CommissionsHelper::calc_deposit_commissions($user, $validated['amount'] ?? null, isset($validated['deposit_currency']) ? strtoupper($validated['deposit_currency']) : $virtual_account->currency);

            $commission_amount = $commissions['commission_amount'];

            $merchant_commission_amount = $commissions['merchant_commission_amount'];

            if (isset($validated['proof'])) {

                $fileName = null;

                $documentFile = $validated['proof'] ?? null;

                if ($documentFile instanceof \Illuminate\Http\UploadedFile) {

                    $fileName = Helper::uploadToS3($documentFile, USER_DOCUMENT_FILE_PATH);

                    throw_if(!$fileName, new Exception(api_error(109), 109));
                } else if (is_string($documentFile) && Helper::isBase64File($documentFile)) {

                    $fileName = Helper::uploadBase64ToS3($documentFile, USER_DOCUMENT_FILE_PATH);

                    throw_if(!$fileName, new Exception(api_error(109), 109));
                }
            }

            if(isset($validated['admin_wallet_id'])) {

                $adminWallet = AdminWallet::where('unique_id', $validated['admin_wallet_id'])->first();

                throw_if(!$adminWallet, new Exception(api_error(202), 202));
            }

            $deposit_transaction = DepositTransaction::create([
                'user_id' => $user->id,
                'virtual_account_id' => $virtual_account->id,
                'amount' => $validated['amount'],
                'commission_amount' => $commission_amount,
                'merchant_commission_amount' => $merchant_commission_amount,
                'total_commission_amount' => $commission_amount + $merchant_commission_amount,
                'total_amount' => $validated['amount'] - ($commission_amount + $merchant_commission_amount),
                'memo' => $referenceId,
                'external_type' => $virtual_account->external_type ?? null,
                'client_reference_id' => $validated['client_reference_id'] ?? null,
                'status' => DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
                'type' => $validated['type'] ?? DEPOSIT_TYPE_TOPUP,
                'source_of_funds' => $validated['source_of_funds'] ?? null,
                'purpose_of_payment' => $validated['purpose_of_payment'] ?? null,
                'proof' => $fileName ?? null,
                'deposit_currency' => $validated['deposit_currency'] ?? null,
                'from_wallet_address' => $validated['from_wallet_address'] ?? null,
                'admin_wallet_id' => isset($adminWallet) ? $adminWallet->id : null,
                'transaction_hash' => $validated['transaction_hash'] ?? null,
            ]);

            // Helper::updateLedger($deposit_transaction);

            DB::afterCommit(function () use ($deposit_transaction) {

                TelegramNotifier::notify(TelegramEvent::DEPOSIT_RECEIVED, $deposit_transaction);
                
                app(ProcessingUnit::class)->createDeposit($deposit_transaction);

                Helper::notifyAccounts($deposit_transaction);
            });

            return $deposit_transaction->refresh();
        });

        return $deposit_transaction;
    }

    public function quote($user, $validated)
    {
        $virtual_account = VirtualAccount::forUser($user)->where('unique_id', $validated['virtual_account_id'])->first();

        throw_if(!$virtual_account, new Exception(api_error(120), 120));

        $commissions = CommissionsHelper::calc_deposit_commissions($user, $validated['amount'] ?? null, isset($validated['deposit_currency']) ? strtoupper($validated['deposit_currency']) : $virtual_account->currency);

        $total_fees = $commissions['commission_amount'] + $commissions['merchant_commission_amount'];

        $data['amount'] = $validated['amount'];

        $data['total_fees'] = $total_fees;

        $data['receiving_amount'] = $validated['amount'] - $total_fees;

        $data['deposit_currency'] = $validated['deposit_currency'];

        return $data;
    }
}
