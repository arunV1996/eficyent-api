<?php

namespace App\Repositories;

use Exception;
use App\Helpers\Helper;
use Illuminate\Http\Request;
use App\Models\VirtualAccount;

class VirtualAccountRepository
{

    public function getAccountsForUser($user, Request $request, $team_member = null): array
    {
        $status = null;

        if($request->filled('status')){

            $status = virtual_account_status_map()[$request->status] ?? null;
        }

        $baseQuery = VirtualAccount::forUser($user)
            ->when($request->filled('country'), fn($q) => $q->where('country', $request->country))
            ->when($request->filled('currency'), fn($q) => $q->where('currency', $request->currency))
            ->when($request->filled('account_number'), fn($q) => $q->where('account_number', $request->account_number))
            ->when(
                $request->filled('account_holder_name'),
                fn($q) =>
                $q->where('account_holder_name', 'like', '%' . $request->account_holder_name . '%')
            )
            ->when(
                $request->filled('account_bank_name'),
                fn($q) =>
                $q->where('account_bank_name', $request->account_bank_name)
            )
            ->when(!is_null($status),
            fn($q) => $q->where('status', $status));

        $baseQuery->orderBy('created_at', 'desc');

        list($skip, $take) = [
            $request->skip ?? 0,
            $request->take ?? TAKE_COUNT
        ];

        $total = $baseQuery->count();

        $allAccountsForTotal = (clone $baseQuery)->get();

        $accounts = $baseQuery->skip($skip)->take($take)->get();

        $groupedTotal = $allAccountsForTotal
            ->groupBy('external_type')
            ->map(function ($bankAccounts) {
                $parent = $bankAccounts->first(fn($a) => empty($a->account_bank_code));
                $swift  = $bankAccounts->first(fn($a) => !empty($a->account_bank_code));

                return ($parent && $swift) ? 1 : $bankAccounts->count();
            })
            ->sum();
    
        $accounts = $this->groupAccountsByExternalType($accounts);

        if ($request->with_balance) {

            foreach ($accounts as $account) {

                $account->balance = Helper::bankBalance($user, $account, $team_member);
            }
        }

        if(!$user->memo){

            $user->update([
                'memo' => Helper::generateUniqueUserMemo($user)
            ]);
        }

        return [
            'total' => $groupedTotal,
            'accounts' => $accounts,
        ];
    }

    public function getBalance($user, $validated, $team_member = null)
    {

        $virtual_account = VirtualAccount::forUser($user)->where('unique_id', $validated['unique_id'])->first();

        throw_if(!$virtual_account, new Exception(api_error(116), 116));

        $virtual_account->balance = Helper::bankBalance($user, $virtual_account, $team_member);

        return $virtual_account;
    }

    public function show($user, $validated, $team_member = null)
    {
        $virtual_account = VirtualAccount::forUser($user)
            ->where('unique_id', $validated['unique_id'])
            ->first();

        throw_if(!$virtual_account, new Exception(api_error(116), 116));

        if (!empty($validated['with_balance']) && $validated['with_balance'] === 1) {
         
            $virtual_account->balance = Helper::bankBalance($user, $virtual_account, $team_member);
        }

        $accounts = VirtualAccount::forUser($user)
            ->where('external_type', $virtual_account->external_type)
            ->get();

        $groupedAccounts = $this->groupAccountsByExternalType($accounts);

        $account = $groupedAccounts->first(
            fn($acc) =>
            $acc->unique_id === $virtual_account->unique_id
                || optional($acc->swift)->unique_id === $virtual_account->unique_id
        );


        if (!empty($validated['with_balance']) && $validated['with_balance'] === 1) {

            $account->balance = Helper::bankBalance($user, $account, $team_member);

        }

        return $account;
    }


    private function groupAccountsByExternalType($accounts)
    {
        $grouped = $accounts->groupBy('external_type');

        $finalAccounts = collect();

        foreach ($grouped as $bankAccounts) {

            $parent = $bankAccounts->first(fn($a) => empty($a->account_bank_code));
            $swift  = $bankAccounts->first(fn($a) => !empty($a->account_bank_code));

            if ($parent && $swift) {
                $parent->swift = $swift;
                $finalAccounts->push($parent);
            } else {
                foreach ($bankAccounts as $acc) {
                    $finalAccounts->push($acc);
                }
            }
        }

        return $finalAccounts->values();
    }
}
