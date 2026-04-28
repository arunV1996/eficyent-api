<?php

namespace App\Jobs;

use App\Factories\Quotes\QuoteFactory;
use App\Models\FxRate;
use App\Models\SupportedCountry;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class RefreshFxRatesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct()
    {
        $this->onQueue('fx_rates');
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        Log::info('RefreshFxRatesJob started');

        $supportedCountries = SupportedCountry::where('status', 1)
            ->pluck('currency')
            ->unique()
            ->toArray();

        $quoteDriver = (new QuoteFactory())->resolve(EXTERNAL_TYPE_MASSIVE);

        $fromCurrencies = ['USD', 'AED'];

        foreach ($fromCurrencies as $fromCurrency) {

            foreach ($supportedCountries as $currency) {

                if ($fromCurrency === $currency) {
                    continue;
                }

                $payload = [
                    'amount'        => 1,
                    'from_currency' => 'USD',
                    'to_currency'   => $currency,
                ];

                try {
                    $response = $quoteDriver->rates($payload, null);

                    if (empty($response['fx_rate'])) {
                        continue;
                    }

                    if($fromCurrency === "AED"){

                        $response['fx_rate'] = convertUSDratetoAED($response);
                    }

                    FxRate::updateOrCreate(
                        [
                            'from_currency' => $fromCurrency,
                            'to_currency'   => $currency,
                            'provider'      => EXTERNAL_TYPE_MASSIVE,
                        ],
                        [
                            'rate' => (string) $response['fx_rate'],
                        ]
                    );

                    Log::info('RefreshFxRatesJob completed');
                } catch (\Throwable $e) {
                    Log::error($e->getMessage());
                }
            }
        }
    }
}
