<?php

namespace App\Console;

use App\Jobs\CheckBeneficiaryTransactionsStatus;
use App\Jobs\ProcessComplianceBatchJob;
use App\Jobs\RefreshFxRatesJob;
use App\Jobs\SyncDiginineCountriesJob;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use App\Jobs\UserTransactionAlertJob;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // $schedule->command('inspire')->hourly();

        // $schedule->job(new SyncDiginineCountriesJob())->daily()->timezone(DEFAULT_TIMEZONE);
        // $schedule->job(new CheckBeneficiaryTransactionsStatus())->hourly()->timezone(DEFAULT_TIMEZONE);
        $schedule->job(new RefreshFxRatesJob())->everyThirtyMinutes()->timezone(DEFAULT_TIMEZONE);

        $schedule->job(new UserTransactionAlertJob)->hourly()->timezone(DEFAULT_TIMEZONE);

    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
