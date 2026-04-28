<?php

namespace App\Providers;

use App\Models\BeneficiaryTransaction;
use App\Models\DepositTransaction;
use App\Observers\BeneficiaryTransactionObserver;
use App\Observers\DepositTransactionObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
        BeneficiaryTransaction::observe(BeneficiaryTransactionObserver::class);
        DepositTransaction::observe(DepositTransactionObserver::class);
    }
}
