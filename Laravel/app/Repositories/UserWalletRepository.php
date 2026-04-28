<?php

namespace App\Repositories;

use App\Helpers\Helper;
use App\Models\Quote;
use App\Models\Sender;
use App\Models\SenderDocument;
use App\Models\SupportedCountry;
use App\Models\TeamMember;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserWalletRepository
{
    public function list($user, Request $request)
    {
        $status = null;

        if ($request->filled('status')) {

            $status = wallet_status_map()[$request->status] ?? null;
        }

        $base_query = Wallet::where('user_id', $user->id)
            ->when($request->filled('search_key'), function ($query) use ($request) {
                $query->where('currency', 'like', '%' . $request->search_key . '%');
            })
            ->when($request->filled('currency'), function ($query) use ($request) {
                $query->where('currency', $request->currency);
            })
            ->when(!is_null($status), function ($query) use ($status) {
                $query->where('status', $status);
            });


        $wallets = $base_query->get();

        $wallets->transform(function ($wallet) use ($user) {

            $wallet->balance = Helper::getWalletBalance($wallet, $user);

            return $wallet;
        });

        $wallets = $wallets->sortByDesc('balance')->values();

        if ($request->filled('only_with_balance') && $request->only_with_balance == true) {

            $wallets = $wallets->filter(fn($w) => $w->balance > 0)->values();
        }

        list($skip, $take) = [$request->skip ?? 0, $request->take ?? TAKE_COUNT];

        $total = $wallets->count();

        $wallets = $wallets->slice($skip, $take)->values();

        return [
            'total' => $total,
            'wallets' => $wallets
        ];
    }

    public function show($user, $id)
    {

        $wallet = Wallet::where('user_id', $user->id)->where('unique_id', $id)->first();

        throw_if(!$wallet, new Exception(api_error(167), 167));

        return $wallet;
    }

    public function convert($user, $validated)
    {

        $quote = Quote::where('unique_id', $validated['quote_id'])->first();

        throw_if(!$quote, new Exception(api_error(121), 121));

        $wallet = Wallet::where('user_id', $user->id)->where('currency', $quote->receiving_currency)->first();

        throw_if(!$wallet, new Exception(api_error(167), 167));

        throw_if($wallet->status != WALLET_STATUS_ACTIVE, new Exception(api_error(169), 169));

        $check_balance = Helper::bankBalance($user, $quote->source);

        throw_if($quote->amount > $check_balance, new Exception(api_error(154), 154));

        $wallet_transaction = DB::transaction(function () use ($user, $wallet, $quote) {

            $wallet_transaction = WalletTransaction::create([
                'user_id' => $user->id,
                'wallet_id' => $wallet->id,
                'quote_id' => $quote->id,
                'amount' => $quote->receiving_amount,
                'total_amount' => $quote->receiving_amount,
                'fees' => $quote->commission_amount,
                'status' => WALLET_TRANSACTION_COMPLETED,
                'type' => TRANSACTION_TYPE_CREDIT,
                'balance_before' => Helper::getWalletBalance($wallet, $user),
                'balance_after' => Helper::getWalletBalance($wallet, $user) + $quote->receiving_amount
            ]);

            throw_if((!$wallet_transaction), new Exception(api_error(123), 123));

            $quote->update([
                'status' => QUOTE_SUBMITTED,
            ]);

            Helper::updateLedger($wallet_transaction);

            $wallet->increment('balance', $quote->receiving_amount);

            return $wallet_transaction->refresh();
        });

        return $wallet_transaction;
    }

    public function walletTransactions($user, $validated)
    {
        $base_query = WalletTransaction::where('user_id', $user->id)->wherenull('beneficiary_transaction_id');

        if(isset($validated['wallet_id']) && !empty($validated['wallet_id'])) {
            $wallet = Wallet::where('unique_id', $validated['wallet_id'])->first();

            throw_if(!$wallet, new Exception(api_error(167), 167));

            $base_query->where('wallet_id', $wallet->id);
        }

        if (!empty($validated['from_date']) && !empty($validated['to_date'])) {
            $base_query->whereBetween('created_at', [
                $validated['from_date'] . ' 00:00:00',
                $validated['to_date'] . ' 23:59:59',
            ]);
        }

        if(isset($validated['transaction_type']) && !empty($validated['transaction_type'])) {
            $base_query->where('type', $validated['transaction_type']);
        }

        if(isset($validated['search_key']) && !empty($validated['search_key'])) {
            $key = '%' . $validated['search_key'] . '%';

            $base_query->where(function ($q) use ($key) {
                $q->where('unique_id', 'like', $key);
            });
        }

        if(isset($validated['status'])) {

            $base_query->where('status', $validated['status']);
        }

        $base_query->orderBy('created_at', 'desc');

        $skip = $validated['skip'] ?? 0;
        $take = $validated['take'] ?? TAKE_COUNT;

        return [
            'total' => $base_query->count(),
            'wallet_transactions' => $base_query->skip($skip)->take($take)->get()
        ];
    }

    public function showTransaction($user, $transaction)
    {
        return WalletTransaction::where('user_id', $user->id)->where('unique_id', $transaction)->first();
    }

    public function create_all_wallets($user)
    {

        if($user->onboarding_step != ONBOARDING_STEP_FOUR_COMPLETED && $user->id_verification != IDENTITY_VERIFICATION_COMPLETED){

            return false;
        }

        $virtual_account = VirtualAccount::forUser($user)->first();

        if(!$virtual_account) {

            return false;
        }

        if($user) {

          $serviceProviders = $user->service_providers ?? [];
        }

        $supportedCountries = SupportedCountry::where('status', 1)
            ->whereIn('external_type', $serviceProviders)
            ->pluck('currency')
            ->unique()
            ->toArray();

        foreach ($supportedCountries as $currency) {

            if($currency == 'USD') {

                continue;
            }

            $wallet = $user->wallets()->where('currency', $currency)->first();

            if (!$wallet) {

                $wallet = $user->wallets()->create([
                    'currency' => $currency,
                ]);
            }
        }

        return true;
    }
}
