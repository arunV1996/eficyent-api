<?php

namespace App\Repositories;

use App\Helpers\Helper;
use App\Http\Resources\SupportedCountryResource;
use Akaunting\Setting\Facade as Setting;
use App\Factories\Quotes\QuoteFactory;
use App\Helpers\CommissionsHelper;
use App\Models\AdminWallet;
use App\Models\FxRate;
use App\Models\SupportedCountry;
use App\Models\VirtualAccount;
use Carbon\Carbon;
use Exception;

class LookupRepository
{
    public function receiving_countries($validated, $user)
    {

        $formatted_type = Helper::format_payment_type($user->user_type, $validated['recipient_type']);

        $supported_countries = Helper::get_receiving_countries($formatted_type, $user);

        $collection = collect($supported_countries)->map(function ($item) {
            return (object) $item;
        });

        $data['receiving_countries'] = SupportedCountryResource::collection($collection);

        $default_country = Setting::get('quote_default_to_country', "IND");

        if (!empty($supported_countries)) {

            $countryCodes = array_column($supported_countries, 'country_code');

            if (!in_array($default_country, $countryCodes)) {

                $default_country = $supported_countries[0]['country_code'];
            }

            $index = array_search($default_country, $countryCodes);

            if ($index !== false) {

                $default_currency = $supported_countries[$index]['currencies'] ?? [];
            } else {

                $default_currency = [];
            }
        } else {

            $default_currency = [];
        }

        $data['defaults'] = [
            'country'  => $default_country,
            'currency' => $default_currency[0] ?? '',
            'amount'   => Setting::get('quote_default_from_amount', 100),
        ];

        return $data;
    }

    public function rates($user, array $payload = [])
    {
        $searchKey = isset($payload['search_key'])  ? strtoupper(trim($payload['search_key'])) : null;

        $supportedCountries = SupportedCountry::where('status', 1)
            ->when($searchKey, function ($q) use ($searchKey) {
                $q->where(function ($q2) use ($searchKey) {
                    $q2->where('currency', 'LIKE', "%{$searchKey}%")
                        ->orWhere('country_code', 'LIKE', "%{$searchKey}%")
                        ->orWhere('country_name', 'LIKE', "%{$searchKey}%");
                });
            })
            ->pluck('currency', 'country_code')
            ->unique()
            ->toArray();


        $rates = [];

        $virtualCurrencies = VirtualAccount::forUser($user)
            ->pluck('currency')
            ->unique()
            ->values()
            ->toArray();

        $fromCurrencies = array_unique(array_merge(['USD'], $virtualCurrencies));

        foreach ($fromCurrencies as $fromCurrency) {

            foreach ($supportedCountries as $countryCode => $currency) {

                if ($fromCurrency === $currency) {
                    continue;
                }

                $cachedRate = FxRate::where([
                    'from_currency' => $fromCurrency,
                    'to_currency'   => $currency,
                ])
                    ->first();

                if ($cachedRate) {

                    $rates[] = [
                        'from_currency' => $cachedRate->from_currency,
                        'to_currency'   => $currency,
                        'fx_rate'       => number_format((float) $cachedRate->rate, 4, '.', ''),
                        'flag'          => Helper::get_flag(get_alpha2_code($countryCode)),
                        'last_updated' => Carbon::parse($cachedRate->updated_at)
                            ->timezone($user->timezone ?? DEFAULT_TIMEZONE)
                            ->diffForHumans(),
                    ];

                    continue;
                }
            }
        }


        $rates = array_map(function ($rate) use ($user) {

            $rate['fx_rate'] = (string) CommissionsHelper::calculate_rate_commission($rate, $user);

            return $rate;
        }, $rates);

        return $rates;
    }

    public function refresh_rates($user, array $payload)
    {

        $supportedCountries = SupportedCountry::where('currency', $payload['to_currency'])->where('status', 1)->first();

        throw_if(!$supportedCountries, new Exception(api_error(189), 189));

        $quoteDriver = (new QuoteFactory())->resolve(EXTERNAL_TYPE_MASSIVE);

        $quotePayload = [
            'amount'        => 1,
            'from_currency' => $payload['from_currency'],
            'to_currency'   => $payload['to_currency'],
        ];

        $response = $quoteDriver->rates($quotePayload, null);

        throw_if(empty($response['fx_rate']), new Exception(api_error(189), 189));
        
        if($payload['from_currency'] == "AED"){

            $response['from_currency'] = "AED";
            
            $response['fx_rate'] = convertUSDratetoAED($response);
        }

        $cachedRate = FxRate::updateOrCreate(
            [
                'from_currency' => $response['from_currency'],
                'to_currency'   => $payload['to_currency'],
                'provider'      => EXTERNAL_TYPE_MASSIVE,
            ],
            [
                'rate' => (string) $response['fx_rate'],
            ]
        );

        $rates[] = [
            'from_currency' => $cachedRate->from_currency,
            'to_currency'   => $cachedRate->to_currency,
            'fx_rate'       => number_format((float) $cachedRate->rate, 4, '.', ''),
            'flag'          => Helper::get_flag(get_alpha2_code($supportedCountries->country_code)),
            'last_updated'  => Carbon::parse($cachedRate->updated_at)
                ->timezone($user->timezone ?? DEFAULT_TIMEZONE)
                ->diffForHumans(),
        ];

        $rates = array_map(function ($rate) use ($user) {

            $rate['fx_rate'] = (string) CommissionsHelper::calculate_rate_commission($rate, $user);

            return $rate;
        }, $rates);

        return $rates;
    }

    public function deposit_wallets($validated)
    {
        $wallets = AdminWallet::where('status', 1)->get();

        return $wallets;
    }
}
