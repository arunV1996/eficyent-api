<?php

namespace App\Jobs;

use App\Helpers\Helper;
use App\Services\Diginine\LookupService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SyncDiginineCountriesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
        //
        $this->onQueue('sync_diginine_countries');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        //

        $lookupService = new LookupService();

        $serviceCorridors = $lookupService->getServiceCorridor([]);

        if (!isset($serviceCorridors['success']) || !$serviceCorridors['success']) {
            return;
        }

        if (!isset($serviceCorridors['data']) || empty($serviceCorridors['data'])) {
            return;
        }

        Helper::syncDiginineCountries($serviceCorridors['data']);
    }
}
