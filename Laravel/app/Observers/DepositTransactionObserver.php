<?php

namespace App\Observers;

use App\Models\DepositTransaction;

class DepositTransactionObserver
{
    /**
     * Handle the DepositTransaction "created" event.
     */
    public function created(DepositTransaction $DepositTransaction): void
    {

        $user = $this->resolveUser();

        $DepositTransaction->statusHistories()->create([
            'from_status' => null,
            'to_status'   => $DepositTransaction->status,
            'changed_by'  => $user['changed_by'],
            'changed_by_type' => $user['changed_by_type'],
            'changed_at'  => $DepositTransaction->created_at,
        ]);
    }

    /**
     * Handle the DepositTransaction "updated" event.
     */
    public function updated(DepositTransaction $DepositTransaction): void
    {
        //
    }

    /**
     * Handle the DepositTransaction "deleted" event.
     */
    public function deleted(DepositTransaction $DepositTransaction): void
    {
        //
    }

    /**
     * Handle the DepositTransaction "restored" event.
     */
    public function restored(DepositTransaction $DepositTransaction): void
    {
        //
    }

    /**
     * Handle the DepositTransaction "force deleted" event.
     */
    public function forceDeleted(DepositTransaction $DepositTransaction): void
    {
        //
    }

    public function updating(DepositTransaction $transaction)
    {
        if (! $transaction->isDirty('status')) {
            return;
        }

        $user = $this->resolveUser();

        $transaction->statusHistories()->create([
            'from_status' => $transaction->getOriginal('status'),
            'to_status'   => $transaction->status,
            'changed_by'  => $user['changed_by'],
            'changed_by_type' => $user['changed_by_type'],
            'changed_at'  => now(),
        ]);
    }

    private function resolveUser(): array
    {
        if (auth('team')->check()) {
            return [
                'changed_by' => auth('team')->id(),
                'changed_by_type' => ACTION_BY_TEAM,
            ];
        }

        if (auth()->check()) {
            return [
                'changed_by' => auth()->id(),
                'changed_by_type' => ACTION_BY_USER,
            ];
        }

        return [
            'changed_by' => null,
            'changed_by_type' => ACTION_BY_SYSTEM,
        ];
    }
}
