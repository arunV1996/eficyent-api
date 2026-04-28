<?php

namespace App\Observers;

use App\Models\BeneficiaryTransaction;

class BeneficiaryTransactionObserver
{
    /**
     * Handle the BeneficiaryTransaction "created" event.
     */
    public function created(BeneficiaryTransaction $beneficiaryTransaction): void
    {

        $user = $this->resolveUser();

        $beneficiaryTransaction->statusHistories()->create([
            'from_status' => null,
            'to_status'   => $beneficiaryTransaction->status,
            'changed_by'  => $user['changed_by'],
            'changed_by_type' => $user['changed_by_type'],
            'changed_at'  => $beneficiaryTransaction->created_at,
        ]);
    }

    /**
     * Handle the BeneficiaryTransaction "updated" event.
     */
    public function updated(BeneficiaryTransaction $beneficiaryTransaction): void
    {
        //
    }

    /**
     * Handle the BeneficiaryTransaction "deleted" event.
     */
    public function deleted(BeneficiaryTransaction $beneficiaryTransaction): void
    {
        //
    }

    /**
     * Handle the BeneficiaryTransaction "restored" event.
     */
    public function restored(BeneficiaryTransaction $beneficiaryTransaction): void
    {
        //
    }

    /**
     * Handle the BeneficiaryTransaction "force deleted" event.
     */
    public function forceDeleted(BeneficiaryTransaction $beneficiaryTransaction): void
    {
        //
    }

    public function updating(BeneficiaryTransaction $transaction)
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
