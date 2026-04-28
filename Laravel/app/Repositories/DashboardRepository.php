<?php

namespace App\Repositories;

use App\Models\BeneficiaryTransaction;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use Exception;
use Illuminate\Http\Request;

class DashboardRepository
{
    public function statistics(Request $request, $user, $team_member = null)
    {
        $today_start = now()->startOfDay();
        $today_end   = now()->endOfDay();

        $bank_account_id = $request->bank_account_id;

        if ($bank_account_id) {

            $virtual_account = VirtualAccount::forUser($user)
                ->where('unique_id', $bank_account_id)
                ->first();

            throw_if(!$virtual_account, new Exception(api_error(120), 120));

            $bank_account_id = $virtual_account->id;
        }

        $wallet_id = $request->wallet_id;

        if ($wallet_id) {

            $wallet = Wallet::where('user_id', $user->id)
                ->where('unique_id', $wallet_id)
                ->first();

            throw_if(!$wallet, new Exception(api_error(167), 167));

            $wallet_id = $wallet->id;
        }


        $failedStatuses = [
            BENEFICIARY_TRANSACTION_FAILED,
            BENEFICIARY_TRANSACTION_EXPIRED,
            BENEFICIARY_TRANSACTION_CANCELLED,
            BENEFICIARY_TRANSACTION_REJECTED,
        ];

        $processingStatuses = [
            BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
            BENEFICIARY_TRANSACTION_APPROVED,
            BENEFICIARY_TRANSACTION_INITIATED,
            BENEFICIARY_TRANSACTION_PROCESSING,
        ];

        $base_query = BeneficiaryTransaction::where('user_id', $user->id)
            ->when($bank_account_id, function ($query) use ($bank_account_id) {
                $query->whereHas('quote', function ($q) use ($bank_account_id) {
                    $q->where('source_id', $bank_account_id);
                });
            })
            ->when($wallet_id, function ($query) use ($wallet_id) {
                $query->whereHas('quote', function ($q) use ($wallet_id) {
                    $q->where('source_id', $wallet_id);
                });
            })
            ->selectRaw("
                count(*) as total_transactions,
                sum(total_amount) as total_amount,
                sum(CASE WHEN status = ? THEN total_amount ELSE 0 END) as total_success_amount,
                SUM(CASE WHEN status IN (?, ?, ?, ?) THEN total_amount ELSE 0 END) as total_failed_amount,
                sum(CASE WHEN status IN (?, ?, ?, ?) THEN total_amount ELSE 0 END) as total_pending_amount,
                sum(CASE WHEN status = ? THEN total_amount ELSE 0 END) as total_rejected_amount
            ", [
                BENEFICIARY_TRANSACTION_COMPLETED,
                ...$failedStatuses,
                ...$processingStatuses,
                BENEFICIARY_TRANSACTION_REJECTED
            ]);

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $base_query = $base_query->where('team_member_id', $team_member->id);
        }

        $base = $base_query->first();

        $today_query = BeneficiaryTransaction::where('user_id', $user->id)
            ->when($bank_account_id, function ($query) use ($bank_account_id) {
                $query->whereHas('quote', function ($q) use ($bank_account_id) {
                    $q->where('source_id', $bank_account_id);
                });
            })
            ->when($wallet_id, function ($query) use ($wallet_id) {
                $query->whereHas('quote', function ($q) use ($wallet_id) {
                    $q->where('source_id', $wallet_id);
                });
            })
            ->whereBetween('created_at', [$today_start, $today_end])
            ->selectRaw("
                count(*) as today_transactions,
                sum(amount) as today_amount,
                sum(CASE WHEN status = ? THEN total_amount ELSE 0 END) as today_success_amount,
                SUM(CASE WHEN status IN (?, ?, ?, ?) THEN total_amount ELSE 0 END) as today_failed_amount,
                sum(CASE WHEN status = ? THEN total_amount ELSE 0 END) as today_pending_amount,
                sum(CASE WHEN status = ? THEN total_amount ELSE 0 END) as today_rejected_amount
            ", [
                BENEFICIARY_TRANSACTION_COMPLETED,
                ...$failedStatuses,
                BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
                BENEFICIARY_TRANSACTION_REJECTED

            ]);

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $today_query = $today_query->where('team_member_id', $team_member->id);
        }

        $today = $today_query->first();

        $statistics = [
            'total_transactions'    => (int) $base->total_transactions,
            'total_amount'          => formatted_amount($base->total_amount),
            'total_success_amount'  => formatted_amount($base->total_success_amount),
            'total_failed_amount'   => formatted_amount($base->total_failed_amount),
            'total_pending_amount'  => formatted_amount($base->total_pending_amount),
            'total_rejected_amount'  => formatted_amount($base->total_rejected_amount),

            'today_transactions'    => (int) $today->today_transactions,
            'today_amount'          => formatted_amount($today->today_amount),
            'today_success_amount'  => formatted_amount($today->today_success_amount),
            'today_failed_amount'   => formatted_amount($today->today_failed_amount),
            'today_pending_amount'  => formatted_amount($today->today_pending_amount),
            'today_rejected_amount'  => formatted_amount($today->today_rejected_amount),
        ];

        return $statistics;
    }

    public function charts_data(Request $request, $user, $team_member = null)
    {

        $isCorporate = $team_member && $team_member->role === TEAM_MEMBER_ROLE_CORPORATE;

        $last_x_days = (int) ($request->last_x_days ?: 10);

        $selects = [];
        $bindings = [];
        $labels = [];

        $failedStatuses = [
            BENEFICIARY_TRANSACTION_FAILED,
            BENEFICIARY_TRANSACTION_EXPIRED,
            BENEFICIARY_TRANSACTION_CANCELLED,
            BENEFICIARY_TRANSACTION_REJECTED
        ];

        $processingStatuses = [
            BENEFICIARY_TRANSACTION_APPROVED,
            BENEFICIARY_TRANSACTION_INITIATED,
            BENEFICIARY_TRANSACTION_PROCESSING,
        ];

        $bank_account_id = $request->bank_account_id;

        if ($bank_account_id) {

            $virtual_account = VirtualAccount::forUser($user)
                ->where('unique_id', $bank_account_id)
                ->first();

            throw_if(!$virtual_account, new Exception(api_error(120), 120));

            $bank_account_id = $virtual_account->id;
        }

        $wallet_id = $request->wallet_id;

        if ($wallet_id) {

            $wallet = Wallet::where('user_id', $user->id)
                ->where('unique_id', $wallet_id)
                ->first();

            throw_if(!$wallet, new Exception(api_error(167), 167));

            $wallet_id = $wallet->id;
        }

        for ($i = 0; $i <= $last_x_days; $i++) {

            $date = now()->subDays($i)->format('Y-m-d');

            $start = common_date("$date 00:00:00", DEFAULT_TIMEZONE, "Y-m-d H:i:s");
            $end   = common_date("$date 23:59:59", DEFAULT_TIMEZONE, "Y-m-d H:i:s");

            $label = now()->subDays($i)->format('d_M_y');
            $safeLabel = str_replace('-', '_', $label);

            $selects[] = "SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_amount ELSE 0 END) AS `$safeLabel`";

            $bindings[] = $start;
            $bindings[] = $end;

            $labels[$safeLabel] = str_replace('_', ' ', $safeLabel);
        }

        $lastX = BeneficiaryTransaction::where('user_id', $user->id)
            ->when($isCorporate, function ($q) use ($team_member) {
                $q->where('team_member_id', $team_member->id);
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
            })
            ->selectRaw(implode(', ', $selects), $bindings)
            ->first()
            ->toArray();

        $data['last_x_days_transactions'] = [
            'model_data' => array_map('floatval', array_reverse(array_values($lastX))),
            'days'       => array_values(array_reverse($labels))
        ];


        $status = BeneficiaryTransaction::where('user_id', $user->id)
            ->when($isCorporate, function ($q) use ($team_member) {
                $q->where('team_member_id', $team_member->id);
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
            })
            ->selectRaw("
                COUNT(*) AS total_transactions,
                COUNT(CASE WHEN status = ? THEN 1 END) AS total_initiated_count,
                COUNT(CASE WHEN status IN (?, ?, ?) THEN 1 END) AS total_processing_count,
                COUNT(CASE WHEN status = ? THEN 1 END) AS total_success_count,
                COUNT(CASE WHEN status IN (?, ?, ?, ?) THEN 1 END) AS total_failed_count,
                COUNT(CASE WHEN status = ? THEN 1 END) AS total_expired_count,
                COUNT(CASE WHEN status = ? THEN 1 END) AS total_pending_count
            ", [
                BENEFICIARY_TRANSACTION_INITIATED,
                ...$processingStatuses,
                BENEFICIARY_TRANSACTION_COMPLETED,
                ...$failedStatuses,
                BENEFICIARY_TRANSACTION_EXPIRED,
                BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL
            ])
            ->first();

        $data['statistics'] = [
            'total_transactions'     => (int) $status->total_transactions,
            'total_success_count'    => (int) $status->total_success_count,
            'total_failed_count'     => (int) ($status->total_failed_count + $status->total_expired_count),
            'total_processing_count' => (int) ($status->total_processing_count + $status->total_initiated_count),
            'total_pending_count'    => (int) $status->total_pending_count
        ];

        return $data;
    }
}
