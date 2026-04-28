<?php

namespace App\Repositories;

use App\Exports\LedgerExport;
use App\Factories\Quotes\QuoteFactory;
use App\Http\Resources\LedgerResource;
use App\Models\BeneficiaryTransaction;
use App\Models\DepositTransaction;
use App\Models\Ledger;
use App\Models\MerchantSetting;
use App\Models\Quote;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Barryvdh\DomPDF\Facade\Pdf;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Maatwebsite\Excel\Facades\Excel;

class LedgerRepository
{
    public function list(array $validated, $user , $getAll = false, $team_member = null)
    {
        $query = Ledger::where('user_id', $user->id);

        if (!empty($validated['from_date']) && !empty($validated['to_date'])) {
            $query->whereBetween('created_at', [
                $validated['from_date'] . ' 00:00:00',
                $validated['to_date'] . ' 23:59:59',
            ]);
        }

        if (!empty($validated['bank_account_id'])) {

            $virtualAccount = VirtualAccount::where('unique_id', $validated['bank_account_id'])->first();

            if ($virtualAccount) {
                $query->where('virtual_account_id', $virtualAccount->id);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if (!empty($validated['wallet_id'])) {

            $wallet = Wallet::where('unique_id', $validated['wallet_id'])->first();

            if ($wallet) {
                $query->where('wallet_id', $wallet->id);
            }
        }

        if (!empty($validated['transaction_type'])) {

            $transactionTypeMap = [
                TRANSACTION_TYPE_CREDIT  => \App\Models\DepositTransaction::class,
                TRANSACTION_TYPE_DEBIT => \App\Models\BeneficiaryTransaction::class,
            ];

            if (isset($transactionTypeMap[$validated['transaction_type']])) {
                $query->where(
                    'transaction_type',
                    $transactionTypeMap[$validated['transaction_type']]
                );
            }
        }

        if (!empty($validated['search_key'])) {

            $key = '%' . $validated['search_key'] . '%';

            $query->where(function ($q) use ($key) {
                $q->where('unique_id', 'like', $key)
                ->orWhereHasMorph(
                    'transaction',
                    [
                        \App\Models\DepositTransaction::class,
                        \App\Models\BeneficiaryTransaction::class
                    ],
                    function ($t) use ($key) {
                        $t->where('unique_id', 'like', $key);
                    }
                );
            });
        }

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $query->whereHasMorph(
                'transaction',
                [DepositTransaction::class, BeneficiaryTransaction::class],
                function ($q) use ($team_member) {
                    $q->where('team_member_id', $team_member->id);
                }
            );
        }

        $total = $query->count();

        if ($getAll) {

            $ledgers = $query->orderBy('created_at', 'desc')->get();

        } else {

            $skip = $validated['skip'] ?? 0;
            $take = $validated['take'] ?? TAKE_COUNT;
            $ledgers = $query->orderBy('created_at', 'desc')->skip($skip)->take($take)->get();
        }

        return [
            'total' => $total,
            'ledgers' => $ledgers
        ];
    }


    public function show($user, $unique_id)
    {
        return Ledger::where('user_id', $user->id)->where('unique_id', $unique_id)->first();
    }

    public function export($validated, $user ,$download_type = FILE_TYPE_PDF){

        $ledgers = $this->list($validated, $user, true);

        $request = new Request($validated);

        $ledger_details = collect($ledgers['ledgers'])->map(function ($ledger) use ($request) {
            return (new LedgerResource($ledger))->toArray($request);
        })->toArray();

        $account_details = null;

        $wallet_details = null;

        if(isset($validated['bank_account_id']) && !empty($validated['bank_account_id'])) {

            $account_details = VirtualAccount::where('unique_id', $validated['bank_account_id'])->first();
        }

        if(isset($validated['wallet_id']) && !empty($validated['wallet_id'])) {

            $wallet_details = Wallet::where('unique_id', $validated['wallet_id'])->first();
        }

        $timestamp = now()->format('Ymd_His');

        $fileNameBase = "bank-statement_{$timestamp}";

        if ($download_type == EXPORT_TYPE_PDF) {

            $fileName = $fileNameBase . '.pdf';

            $html = view('pdf.ledgers', compact('ledger_details', 'account_details', 'wallet_details'))->render();

            $mpdf = new \Mpdf\Mpdf(['tempDir' => storage_path('app/temp')]);

            $merchantSetting = MerchantSetting::where('merchant_id', $user->merchant->id ?? null)->where('key', 'password_enabled')->first();

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

        }else {

            $fileName = $fileNameBase . '.xlsx';

            $excel = Excel::store(new LedgerExport($ledger_details), $fileName, 'public');

            throw_if(!$excel, new Exception(api_error(165), 165));
        }

        $url = url(Storage::url($fileName));

        return $url;
    }
}
