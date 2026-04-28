<?php

namespace App\Helpers;

use Exception;
use App\Models\User;
use App\Models\Quote;
use App\Models\State;
use App\Models\Ledger;
use App\Models\Lookup;
use App\Models\Sender;
use App\Models\Wallet;
use Endroid\QrCode\QrCode;
use App\Models\ServiceBank;
use Illuminate\Support\Str;
use App\Models\UserDocument;
use App\Models\VirtualAccount;
use App\Models\MerchantSetting;
use Illuminate\Validation\Rule;
use App\Models\SupportedCountry;
use App\Models\MobileCountryCode;
use App\Models\WalletTransaction;
use App\Models\DepositTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Facades\Crypt;
use App\Models\BeneficiaryTransaction;
use Illuminate\Support\Facades\Storage;
use Akaunting\Setting\Facade as Setting;
use Illuminate\Support\Facades\Validator;
use App\Factories\Quotes\QuoteSourceFactory;
use App\Factories\VirtualAccounts\VirtualAccountFactory;
use App\Repositories\BeneficiaryAccountRepository;
use Illuminate\Support\Facades\File;
use App\Rules\ValidateEmail;
use App\ExternalServices\Compliance\ComplianceService;
use App\ExternalServices\InvoiceMate\InvoiceMate;
use App\ExternalServices\ProcessingUnit\ProcessingUnit;
use App\Models\DepositTransactionsAccount;

class Helper
{

    public static function generate_random_string()
    {

        return sha1(time() . rand());
    }
    public static function create_bearer(User $user): string
    {
        // $user->tokens()->delete();

        return $user->createToken(INTERNAL_API_TOKEN, [AUTHENTICATION_ABILITY])->plainTextToken;
    }

    public static function create_merchant_bearer(User $user): array
    {
        $minutes = 30;

        $expiresAt = now()->addMinutes($minutes);

        $token = $user->createToken(INTERNAL_API_TOKEN,[AUTHENTICATION_ABILITY]);

        $token->accessToken->forceFill([
            'expires_at' => $expiresAt
        ])->save();

        return [
            'access_token' => $token->plainTextToken,
            'expires_at'   => common_date($expiresAt, $user->timezone),
            'expires_in'   => $minutes * 60,
        ];
    }

    public static function uploadToS3($file, $path = '')
    {
        try {

            $extension = $file->getClientOriginalExtension();

            $fileName = uniqid() . '_' . time() . '.' . $extension;

            $fullPath = trim($path, '/') . '/' . $fileName;

            Storage::disk('s3')->put($fullPath, file_get_contents($file), [
                'visibility' => 'private',
                'ContentType' => $file->getMimeType()
            ]);

            return Storage::disk('s3')->url($fullPath);
        } catch (Exception $e) {

            Log::error("File upload failed", [
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }
    public static function uploadBase64ToS3($base64String, $path = '')
    {
        try {

            preg_match('/^data:(.*?);base64,(.*)$/', $base64String, $matches);

            if (count($matches) !== 3) {

                return false;
            }

            $mime = $matches[1];

            $data = base64_decode($matches[2]);

            if ($data === false) {

                return false;
            }

            $extension = explode('/', $mime)[1] ?? 'bin';

            $fileName = uniqid() . '_' . time() . '.' . $extension;

            $fullPath = trim($path, '/') . '/' . $fileName;

            Storage::disk('s3')->put($fullPath, $data, [
                'visibility' => 'private',
                'ContentType' => $mime
            ]);

            return Storage::disk('s3')->url($fullPath);
        } catch (\Exception $e) {

            return false;
        }
    }


    public static function isBase64File($value)
    {
        return preg_match('/^data:\w+\/[-+\w.]+;base64,/', $value);
    }


    public static function temporary_s3_url($path)
    {
        if (str_starts_with($path, 'http')) {
            $parsed = parse_url($path);
            $path = ltrim($parsed['path'], '/');
        }

        return Storage::disk('s3')->temporaryUrl($path, now()->addMinutes(AWS_TEMP_URL_EXPIRY));
    }

    public static function get_flag($country_code)
    {
        return asset("images/countries/" . strtolower($country_code) . ".png");
    }

    public static function get_mobile_country_codes()
    {

        $mobile_country_codes = MobileCountryCode::supported()->orderBy('country_name')->get();

        $mobile_country_codes = collect($mobile_country_codes)
            ->map(function ($item) {
                return [
                    'label' => $item['alpha_2_code'],
                    'value' => $item['isd_code'],
                    'country_name' => $item['country_name'],
                    'flag' => Helper::get_flag($item['alpha_2_code'])
                ];
            })
            ->values()
            ->toArray();

        return $mobile_country_codes;
    }

    public static function get_states($country_code = null)
    {
        $query = State::orderBy('name');

        $alpha3Code = get_alpha3_code($country_code);

        if ($country_code) {
            $query->where('country_code', $country_code)
                ->orWhere('country_alpha3', $alpha3Code);
        }

        $states = $query->get()
            ->map(function ($item) {
                return [
                    'label' => $item['name'],
                    'value' => $item['name'],
                    'country_code' => $item['country_alpha3'],
                ];
            })
            ->values()
            ->toArray();

        return $states;
    }


    public static function get_countries()
    {

        $countries = MobileCountryCode::supported()->orderBy('country_name')->get();

        $countries = collect($countries)
            ->map(function ($item) {
                return [
                    'label' => $item['country_name'],
                    'value' => $item['alpha_3_code'],
                    'flag' => Helper::get_flag($item['alpha_2_code']),
                ];
            })
            ->values()
            ->toArray();

        return $countries;
    }
    public static function get_lookups($type , $external_type = null)
    {

        $lookups = Lookup::where('type', $type)->get();

        if($external_type) {

            $lookups = $lookups->where('external_type', $external_type);
        }
        $lookups = collect($lookups)
            ->map(function ($item) {
                return [
                    'label' => $item['value'],
                    'value' => $item['key'],
                ];
            })
            ->values()
            ->toArray();

        return $lookups;
    }

    public static function get_payment_rails()
    {
        $networks = [
            [
                'label' => 'Wire',
                'value' => PAYMENT_RAIL_WIRE
            ],
            [
                'label' => 'ACH',
                'value' => PAYMENT_RAIL_ACH
            ],
            [
                'label' => 'Swift',
                'value' => PAYMENT_RAIL_SWIFT
            ]
        ];

        return $networks;
    }

    public static function get_account_types()
    {
        $account_types = [
            [
                'label' => 'Checking',
                'value' => BENEFICIARY_ACCOUNT_TYPE_CHECKING
            ],
            [
                'label' => 'Savings',
                'value' => BENEFICIARY_ACCOUNT_TYPE_SAVINGS
            ],
            [
                'label' => 'General Ledger',
                'value' => BENEFICIARY_ACCOUNT_TYPE_GENERAL_LEDGER
            ],
            [
                'label' => 'Loan',
                'value' => BENEFICIARY_ACCOUNT_TYPE_LOAN
            ]
        ];

        return $account_types;
    }

    public static function buildFormRules(array $field, array &$rules, string $prefix = '')
    {
        $fieldKey = $prefix ? "{$prefix}.{$field['field_key']}" : $field['field_key'];

        if ($field['field_type'] === 'group') {

            if (!empty($field['is_repeatable']) && $field['is_repeatable'] === true) {

                $rules[$fieldKey] = ['array', $field['is_mandatory'] ? 'required' : 'nullable',];

                if (!empty($field['validation']['min_length'])) {

                    $rules[$fieldKey][] = 'min:' . $field['validation']['min_length'];
                }

                if (!empty($field['validation']['max_length'])) {

                    $rules[$fieldKey][] = 'max:' . $field['validation']['max_length'];
                }

                $groupKey = $fieldKey . '.*';
            } else {

                $groupKey = $fieldKey;

                $rules[$fieldKey] = [$field['is_mandatory'] ? 'required' : 'nullable', 'array'];
            }

            if (!empty($field['children'])) {

                foreach ($field['children'] as $child) {

                    Helper::buildFormRules($child, $rules, $groupKey);
                }
            }

            return;
        }
        $rule = [];

        $rule[] = $field['is_mandatory'] ? 'required' : 'nullable';

        switch ($field['field_type']) {

            case 'number':

                $rule[] = 'numeric';

                if (!empty($field['validation']['min_value']) && !empty($field['validation']['max_value'])) {

                    $rule[] = 'between:' . $field['validation']['min_value'] . ',' . $field['validation']['max_value'];
                }

                break;

            case 'email':

                $rule[] = 'email';

                $rule[] = new ValidateEmail();

                break;

            case 'string':

                $rule[] = 'string';

                break;

            case 'date':

                $rule[] = 'date';

                $rule[] = 'date_format:Y-m-d';

                if (!empty($field['validation']['max_date'])) {

                    $rule[] = 'before_or_equal:' . $field['validation']['max_date'];
                }

                break;


            case 'file':

                $maxBytes = !empty($field['validation']['max_file_size'])
                    ? (int) $field['validation']['max_file_size']
                    : null;

                $allowedMimes = $field['validation']['accepted_extensions'] ?? [];

                $rules[$fieldKey] = [ $field['is_mandatory'] ? 'required' : 'nullable',

                    function ($attribute, $value, $fail) use ($maxBytes, $allowedMimes) {

                        if ($value === null) {
                            return;
                        }

                        if (is_string($value) && str_starts_with($value, 'data:')) {

                            if (!preg_match('/^data:(.*?);base64,(.*)$/', $value, $matches)) {
                                $fail('Invalid Base64 format.');
                                return;
                            }

                            $binary = base64_decode($matches[2], true);

                            if ($binary === false) {
                                $fail('Invalid Base64 encoding.');
                                return;
                            }

                            if ($maxBytes && strlen($binary) > $maxBytes) {
                                $fail('File exceeds maximum allowed size.');
                                return;
                            }

                            $finfo = finfo_open(FILEINFO_MIME_TYPE);
                            $realMime = finfo_buffer($finfo, $binary);
                            finfo_close($finfo);

                            if (!empty($allowedMimes) && !in_array($realMime, $allowedMimes, true)) {
                                $fail('Invalid file type: ' . $realMime);
                            }

                            return;
                        }

                        if (!$value instanceof \Illuminate\Http\UploadedFile) {
                            $fail('The file must be uploaded as a valid file.');
                            return;
                        }

                        if ($maxBytes && $value->getSize() > $maxBytes) {
                            $fail('File exceeds maximum allowed size.');
                            return;
                        }

                        if (!empty($allowedMimes) && !in_array($value->getMimeType(), $allowedMimes, true)) {
                            $fail('Invalid file type: ' . $value->getMimeType());
                        }
                    }
                ];

                return;
        }

        if (!empty($field['validation']['min_length'])) {

            $rule[] = 'min:' . $field['validation']['min_length'];
        }

        if (!empty($field['validation']['max_length'])) {

            $rule[] = 'max:' . $field['validation']['max_length'];
        }

        if (!empty($field['validation']['regex'])) {

            $regex = trim($field['validation']['regex'], '/');

            $rule[] = 'regex:/' . $regex . '/';
        }

        if (!empty($field['values_supported'])) {

            $allowedValues = array_column($field['values_supported'], 'value');
            $allowedLower  = array_map('mb_strtolower', $allowedValues);

            $rule[] = function ($attribute, $value, $fail) use ($allowedLower) {

                if ($value === null) {
                    return;
                }

                if (!in_array(mb_strtolower($value), $allowedLower, true)) {
                    $fail("The selected {$attribute} is invalid.");
                }
            };
        }


        if(!empty($field['field_type']) && $field['field_type'] === 'file') {

            if(!empty($field['validation']['is_mandatory'])) {
                $rule[] = 'required';
            }
        }

        if (!empty($field['required_if'])) {

            $rule[] = 'required_with:' . $field['required_if'];
        }

        if (!empty($field['required_if_empty_of'])) {

            $otherField = $prefix ? "{$prefix}.{$field['required_if_empty_of']}" : $field['required_if_empty_of'];

            $rule[] = 'required_without:' . $otherField;
        }

        $rules[$fieldKey] = $rule;
    }

    public static function syncDiginineCountries($countries)
    {
        if (empty($countries)) {
            Log::info('No countries to sync');
            return 0;
        }

        $syncedCount = 0;

        foreach ($countries as $countryData) {

            if (!is_array($countryData)) {
                Log::info('Invalid country data: ' . json_encode($countryData));
                continue;
            }

            if(!isset($countryData['receiving_country_code'])) {
                Log::info('Invalid country data: ' . json_encode($countryData));
                continue;
            }

            if (empty($countryData['receiving_country_code'])) {
                Log::info('Invalid country data: ' . json_encode($countryData));
                continue;
            }

            $mccRecord = MobileCountryCode::where('alpha_2_code', $countryData['receiving_country_code'])->first();

            if (!$mccRecord) {
                Log::info('Country not found for alpha_2_code: ' . $countryData['receiving_country_code']);
                continue;
            }

            SupportedCountry::updateOrCreate(
                [
                    'country_code' => $mccRecord->alpha_3_code,
                    'external_type' => EXTERNAL_TYPE_DIGININE,
                ],
                [
                    'country_name' => $countryData['receiving_country'],
                    'currency' => $countryData['limit_currency_code'],
                ]
            );

            $syncedCount++;
        }

        return $syncedCount;
    }

    public static function syncDiginineLookups($lookups)
    {
        if (empty($lookups)) {
            return 0;
        }

        $syncedCount = 0;

        foreach ($lookups as $key => $lookupData) {

            if (!is_array($lookupData)) {
                continue;
            }

            if (empty($lookupData)) {
                continue;
            }

            foreach($lookupData as $value) {

                if(empty($value['code']) || empty($value['name'])) {

                    continue;
                }

                Lookup::updateOrCreate(
                    [
                        'type' => $key,
                        'key' => $value['code'],
                    ],
                    [
                        'value' => $value['name'],
                        'external_type' => EXTERNAL_TYPE_DIGININE,
                    ]
                );
            }

            $syncedCount++;
        }

        return $syncedCount;
    }

    public static function syncDiginineBanks($banks, $country_code)
    {

        if (empty($banks['list'])) {
            return 0;
        }

        $syncedCount = 0;

        foreach ($banks['list'] as $bank) {

            ServiceBank::updateOrCreate(
                [
                    'bank_id' => $bank['bank_id'],
                ],
                [
                    'bank_name' => $bank['bank_name'],
                    'country' => $country_code,
                    'external_type' => EXTERNAL_TYPE_DIGININE,
                ]
            );

            $syncedCount++;
        }

        return $syncedCount;
    }

    public static function syncCalizaLookups()
    {

        $syncedCount = 0;

        $id_types = [
            [
                'key' => "PASSPORT",
                'value' => "Passport",
                'type' => LOOKUP_TYPE_ID_TYPE
            ],
            [
                'key' => "ID_CARD",
                'value' => "ID Card",
                'type' => LOOKUP_TYPE_ID_TYPE
            ],
            [
                'key' => "DRIVING_LICENSE",
                'value' => "Driving License",
                'type' => LOOKUP_TYPE_ID_TYPE
            ]
        ];

        foreach ($id_types as $id_type) {

            Lookup::updateOrCreate(
                ['key' => $id_type['key']],
                [
                    'key' => $id_type['key'],
                    'value' => $id_type['value'],
                    'type' => $id_type['type'],
                    'external_type' => EXTERNAL_TYPE_CALIZA,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $syncedCount++;
        }

        $proof_of_address = [
            [
                'key' => "UTILITY_BILL",
                'value' => "Utility Bill",
                'type' => LOOKUP_TYPE_PROOF_OF_ADDRESS
            ],
            [
                'key' => "BANK_STATEMENT",
                'value' => "Bank Statement",
                'type' => LOOKUP_TYPE_PROOF_OF_ADDRESS
            ],
            [
                'key' => "RENTAL_AGREEMENT",
                'value' => "Rental Agreement",
                'type' => LOOKUP_TYPE_PROOF_OF_ADDRESS
            ],
            [
                'key' => "TAX_DOCUMENT",
                'value' => "Tax Document",
                'type' => LOOKUP_TYPE_PROOF_OF_ADDRESS
            ],
            [
                'key' => "GOVERNMENT_CORRESPONDENCE",
                'value' => "Government Correspondence",
                'type' => LOOKUP_TYPE_PROOF_OF_ADDRESS
            ]
        ];

        foreach ($proof_of_address as $proof_of_address) {

            Lookup::updateOrCreate(
                ['key' => $proof_of_address['key']],
                [
                    'key' => $proof_of_address['key'],
                    'value' => $proof_of_address['value'],
                    'type' => $proof_of_address['type'],
                    'external_type' => EXTERNAL_TYPE_CALIZA,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $syncedCount++;
        }

        $purpose_of_transaction = [
            [
                'key' => "business_transactions",
                'value' => "Business Transactions",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "charitable_donations",
                'value' => "Charitable Donations",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "investment_purposes",
                'value' => "Investment Purposes",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "payments_to_friends_or_family_abroad",
                'value' => "Payments to Friends or Family Abroad",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "personal_or_living_expenses",
                'value' => "Personal or Living Expenses",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "protect_wealth",
                'value' => "Protect Wealth",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ],
            [
                'key' => "other",
                'value' => "Others",
                'type' => LOOKUP_TYPE_PURPOSE_OF_TRANSACTION
            ]
        ];

        foreach ($purpose_of_transaction as $purpose_of_transaction) {

            Lookup::updateOrCreate(
                ['key' => $purpose_of_transaction['key']],
                [
                    'key' => $purpose_of_transaction['key'],
                    'value' => $purpose_of_transaction['value'],
                    'type' => $purpose_of_transaction['type'],
                    'external_type' => EXTERNAL_TYPE_CALIZA,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $syncedCount++;
        }

        $source_of_funds = [
            [
                'key' => "business_income",
                'value' => "Business Income",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "gambling_proceeds",
                'value' => "Gambling Proceeds",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "gifts",
                'value' => "Gifts",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "government_benefits",
                'value' => "Government Benefits",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "inheritance",
                'value' => "Inheritance",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "investment_loans",
                'value' => "Investment Loans",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "pension_retirement",
                'value' => "Pension Retirement",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "salary",
                'value' => "Salary",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "sale_of_assets_real_estate",
                'value' => "Sale of Assets (Real Estate)",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "savings",
                'value' => "Savings",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "esops",
                'value' => "ESOPs",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "investment_proceeds",
                'value' => "Investment Proceeds",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ],
            [
                'key' => "someone_else_funds",
                'value' => "Someone Else Funds",
                'type' => LOOKUP_TYPE_SOURCE_OF_FUNDS
            ]
        ];

        foreach ($source_of_funds as $source_of_funds) {

            Lookup::updateOrCreate(
                ['key' => $source_of_funds['key']],
                [
                    'key' => $source_of_funds['key'],
                    'value' => $source_of_funds['value'],
                    'type' => $source_of_funds['type'],
                    'external_type' => EXTERNAL_TYPE_CALIZA,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );

            $syncedCount++;
        }

        return $syncedCount;
    }

    public static function syncCurrencyPaymentMethodLookups(): int
    {
        $currencyNames = [
            'EUR' => 'Euro',
            'GBP' => 'British Pound',
            'CHF' => 'Swiss Franc',

            'INR' => 'Indian Rupee',
            'JPY' => 'Japanese Yen',
            'CNY' => 'Chinese Yuan',
            'HKD' => 'Hong Kong Dollar',
            'SGD' => 'Singapore Dollar',
            'MYR' => 'Malaysian Ringgit',
            'THB' => 'Thai Baht',
            'PHP' => 'Philippine Peso',
            'IDR' => 'Indonesian Rupiah',
            'VND' => 'Vietnamese Dong',
            'KRW' => 'South Korean Won',
            'TWD' => 'Taiwan Dollar',
            'PKR' => 'Pakistani Rupee',
            'BDT' => 'Bangladeshi Taka',
            'LKR' => 'Sri Lankan Rupee',

            'USD' => 'US Dollar',
            'CAD' => 'Canadian Dollar',
            'MXN' => 'Mexican Peso',
            'BRL' => 'Brazilian Real',
            'ARS' => 'Argentine Peso',
            'CLP' => 'Chilean Peso',

            'AED' => 'UAE Dirham',
            'SAR' => 'Saudi Riyal',
            'QAR' => 'Qatari Riyal',
            'KWD' => 'Kuwaiti Dinar',
            'BHD' => 'Bahraini Dinar',
            'OMR' => 'Omani Rial',
            'ILS' => 'Israeli Shekel',
            'TRY' => 'Turkish Lira',

            'ZAR' => 'South African Rand',
            'NGN' => 'Nigerian Naira',
            'KES' => 'Kenyan Shilling',
            'EGP' => 'Egyptian Pound',

            'AUD' => 'Australian Dollar',
            'NZD' => 'New Zealand Dollar',
        ];

        $paymentMethodsByCurrency = [
            'EUR' => [
                'SEPA (Domestic)',
                'SEPA (Cross-border)',
                'SWIFT (International)',
            ],
            'GBP' => [
                'Faster Payments (Domestic)',
                'BACS (Domestic)',
                'CHAPS (High Value)',
                'SWIFT (International)',
            ],
            'CHF' => [
                'SWIFT (International)',
            ],

            'INR' => [
                'IMPS (Instant)',
                'NEFT (Same Day)',
                'RTGS (High Value)',
                'UPI (Instant)',
                'SWIFT (International)',
            ],
            'JPY' => [
                'Zengin (Domestic)',
                'SWIFT (International)',
            ],
            'CNY' => [
                'CNAPS (Domestic)',
                'CIPS (Cross-border)',
                'SWIFT (International)',
            ],
            'HKD' => [
                'FPS (Instant)',
                'CHATS (RTGS)',
                'SWIFT (International)',
            ],
            'SGD' => [
                'FAST (Instant)',
                'GIRO (Batch)',
                'PayNow (Instant)',
                'SWIFT (International)',
            ],
            'MYR' => [
                'IBG (Domestic)',
                'DuitNow (Instant)',
                'SWIFT (International)',
            ],
            'THB' => [
                'BAHTNET (Domestic)',
                'PromptPay (Instant)',
                'SWIFT (International)',
            ],
            'PHP' => [
                'InstaPay (Real-time)',
                'PESONet (Batch)',
                'SWIFT (International)',
            ],
            'IDR' => [
                'BI-FAST (Real-time)',
                'RTGS (High Value)',
                'SWIFT (International)',
            ],
            'VND' => [
                'NAPAS 247 (Instant)',
                'CITAD (High Value)',
                'SWIFT (International)',
            ],
            'KRW' => [
                'KFTC (Domestic)',
                'SWIFT (International)',
            ],
            'TWD' => [
                'FISC (Domestic)',
                'SWIFT (International)',
            ],
            'PKR' => [
                'Raast (Instant)',
                'IBFT (Inter-bank)',
                'SWIFT (International)',
            ],
            'BDT' => [
                'BEFTN (Domestic)',
                'RTGS (High Value)',
                'bKash (Mobile)',
                'SWIFT (International)',
            ],
            'LKR' => [
                'CEFTS (Domestic)',
                'SWIFT (International)',
            ],

            'USD' => [
                'ACH (Domestic)',
                'Fedwire (Domestic Wire)',
                'SWIFT (International)',
            ],
            'CAD' => [
                'EFT (Domestic)',
                'Interac e-Transfer',
                'SWIFT (International)',
            ],
            'MXN' => [
                'SPEI (Domestic)',
                'SWIFT (International)',
            ],
            'BRL' => [
                'PIX (Instant)',
                'TED (Same Day)',
                'SWIFT (International)',
            ],
            'ARS' => [
                'CBU/CVU (Domestic)',
                'SWIFT (International)',
            ],
            'CLP' => [
                'SWIFT (International)',
            ],

            'AED' => [
                'UAEFTS (Domestic)',
                'SWIFT (International)',
            ],
            'SAR' => [
                'SARIE (Domestic)',
                'SWIFT (International)',
            ],
            'QAR' => [
                'QATCH (Domestic)',
                'SWIFT (International)',
            ],
            'KWD' => [
                'KNET (Domestic)',
                'SWIFT (International)',
            ],
            'BHD' => [
                'EFTS (Domestic)',
                'SWIFT (International)',
            ],
            'OMR' => [
                'Local Transfer',
                'SWIFT (International)',
            ],
            'ILS' => [
                'Masav (Domestic)',
                'SWIFT (International)',
            ],
            'TRY' => [
                'EFT (Domestic)',
                'SWIFT (International)',
            ],

            'ZAR' => [
                'EFT (Domestic)',
                'RTC (Real-time)',
                'SWIFT (International)',
            ],
            'NGN' => [
                'NIP (Instant)',
                'NEFT (Batch)',
                'SWIFT (International)',
            ],
            'KES' => [
                'PesaLink (Instant)',
                'RTGS (High Value)',
                'M-PESA (Mobile)',
                'SWIFT (International)',
            ],
            'EGP' => [
                'ACH (Domestic)',
                'RTGS (High Value)',
                'SWIFT (International)',
            ],

            'AUD' => [
                'NPP/PayID (Instant)',
                'BPAY (Bill Pay)',
                'Direct Entry',
                'SWIFT (International)',
            ],
            'NZD' => [
                'Same Day Cleared',
                'SWIFT (International)',
            ],
        ];

        $count = 0;

        foreach ($paymentMethodsByCurrency as $currencyCode => $methods) {

            if (!isset($currencyNames[$currencyCode])) {
                continue;
            }

            $key = "{$currencyCode} ({$currencyNames[$currencyCode]})";

            foreach ($methods as $methodLabel) {

                Lookup::updateOrCreate(
                    [
                        'key'   => $key,
                        'value' => $methodLabel,
                        'type'  => LOOKUP_TYPE_PAYMENT_METHOD,
                    ],
                    [
                        'external_type' => EXTERNAL_TYPE_DIGININE,
                        'status'        => ACTIVE,
                    ]
                );

                $count++;
            }
        }

        return $count;
    }


    public static function syncCountryRequirementsLookups(): void
    {
        $path = database_path('seeders/data/country_requirements');

        $files = File::files($path);

        foreach ($files as $file) {
            $data = json_decode(File::get($file), true);

            if (empty($data['countryCode'])) {
                continue;
            }

            $json = json_encode($data);

            // $compressed = base64_encode(gzcompress($json, 9));

            Lookup::updateOrCreate(
                [
                    'type' => LOOKUP_TYPE_COUNTRY_CONFIGURATIONS,
                    'key'  => $data['countryCode'],
                ],
                [
                    'value' => $json,
                ]
            );
        }
        
    }


    public static function format_payment_type($user_type, $receipient_type)
    {
        $senderType = (int) $user_type;

        $recipientType = (int) $receipient_type;

        $senderIsBusiness = $senderType === 2;

        $recipientIsBusiness = $recipientType === 2;

        if ($senderIsBusiness && $recipientIsBusiness) {
            return B2B;
        }

        if ($senderIsBusiness && !$recipientIsBusiness) {
            return B2C;
        }

        if (!$senderIsBusiness && $recipientIsBusiness) {
            return C2B;
        }

        return C2C;
    }

    public static function get_receiving_countries($payment_type, $user)
    {
        $rows = collect();

        if ($user->merchant) {

            $merchant_countries = MerchantSetting::where('merchant_id', $user->merchant->id)->where('key', 'payout_countries')->first();

            if ($merchant_countries) {

                $supported_ids = json_decode($merchant_countries->value, true);

                if (!is_array($supported_ids) || empty($supported_ids)) {
                    return [];
                }

                $rows = SupportedCountry::supported()
                    ->select('country_name', 'country_code', 'currency', 'external_type', 'type')
                    ->whereIn('id', $supported_ids)
                    ->when(!empty($payment_type), function ($query) use ($payment_type) {
                        $query->where(function ($q) use ($payment_type) {
                            $q->whereNull('type')
                                ->orWhere('type', $payment_type);
                        });
                    })
                    ->orderBy('country_name')
                    ->get();

            }
        } else {

            $serviceProviders = $user->service_providers ?? [];

            foreach ($user->userServices()->where('is_active', 1)->get() as $service) {
                $serviceProviders[] = $service->service_type;
            }

            $rows = SupportedCountry::supported()
                ->select('country_name', 'country_code', 'currency', 'external_type', 'type')
                ->when(!empty($serviceProviders), function ($query) use ($serviceProviders) {
                    $query->whereIn('external_type', $serviceProviders);
                })
                ->when(!empty($payment_type), function ($query) use ($payment_type) {
                    $query->where(function ($q) use ($payment_type) {
                        $q->whereNull('type')
                            ->orWhere('type', $payment_type);
                    });
                })
                ->orderBy('country_name')
                ->get();
        }

        if ($rows->isEmpty()) {

            return [];
        }
        $grouped = $rows->groupBy(function ($row) {
            return $row->country_code ?? $row['country_code'] ?? null;
        })
            ->map(function ($items) {

                $first = $items->first();

                return [
                    'country_name' => $first->country_name ?? $first['country_name'] ?? '',
                    'country_code' => $first->country_code ?? $first['country_code'] ?? '',
                    'currencies'   => $items->map(function ($i) {
                        return $i->currency ?? $i['currency'] ?? null;
                    })
                        ->filter()
                        ->unique()
                        ->values()
                        ->all(),
                ];
            })
            ->values()
            ->toArray();

        return $grouped;
    }


    public static function blockExtraFields($request, $validator, array $allowedKeys): void
    {
        $incomingKeys = array_keys($request->all());

        $extra = array_diff($incomingKeys, $allowedKeys);

        if (!empty($extra)) {
            $validator->errors()->add(
                'extra_fields',
                'Unexpected fields: ' . implode(',', $extra)
            );
        }
    }

    public static function createQR($data, $file_path)
    {

        $qr_code = new QrCode($data);

        $writer = new PngWriter();

        $qr_code_image = $writer->write($qr_code)->getString();

        Storage::disk('public')->put($file_path, $qr_code_image);

        return url(Storage::url($file_path));
    }

    public static function generate_email_code()
    {

        return mt_rand(100000, 999999);
    }

    public static function generateBackupCodes()
    {

        $backup_codes = [];

        while (count($backup_codes) != 10) {

            $backup_codes[] = self::generate_email_code();

            $backup_codes = array_unique($backup_codes);
        }

        return implode(',', $backup_codes);
    }

    public static function checkBackupCode($user, $entered_code)
    {

        $backup_codes = explode(',', $user->backup_codes);

        if (!in_array($entered_code, $backup_codes)) {
            return false;
        }

        $key = array_search($entered_code, $backup_codes);

        unset($backup_codes[$key]);

        DB::transaction(function () use ($user, $backup_codes) {

            $user->update(['backup_codes' => implode(',', $backup_codes)]);
        });

        return true;
    }

    public static function verifyTfaCode($user, $verification_code)
    {
        if (config('app.is_sandbox')) {
            return true;            
        }
        throw_if(!$user->tfa_secret, new Exception(api_error(138), 138));

        $google2fa = app('pragmarx.google2fa');

        if (!$google2fa->verifyKey(Crypt::decryptString($user->tfa_secret), Str::replace(" ", "", $verification_code))) {

            return Helper::checkBackupCode($user, $verification_code);
        }

        return true;
    }

    public static function get_service_banks($country_code, $currency = null, $external_type = EXTERNAL_TYPE_DIGININE)
    {

        $query = ServiceBank::where('country', $country_code)
            ->where('external_type', $external_type)
            ->orderBy('bank_name');

        if ($currency) {
            $query->where(function ($q) use ($currency) {
                $q->whereNull('currency')
                    ->orWhere('currency', $currency);
            });
        }

        $service_banks = $query->get()
            ->map(function ($item) {
                return [
                    'label' => $item['bank_name'],
                    'value' => $item['unique_id'],
                ];
            })
            ->values()
            ->toArray();

        return $service_banks;
    }

    public static function updateLedger($transaction, $description = null , $refund_ledger_id = null)
    {

        $ledger = $transaction->ledger()->first();

        if ($ledger) {

            return;
        }

        $virtual_account_id = null;

        $wallet_id = null;

        if ($transaction->quote) {

            $quotesource = QuoteSourceFactory::resolve($transaction->quote->source_type, $transaction->quote->source_id, $transaction->user);

            if($quotesource instanceof VirtualAccount) {

                $virtual_account_id = $quotesource->id;
            }else{

                $wallet_id = $quotesource->id;
            }

        } elseif ($transaction->virtual_account_id) {

            $virtual_account_id = $transaction->virtual_account_id;
        }

        if($transaction instanceof WalletTransaction) {

            $wallet_id = $transaction->wallet_id;
        }



        if (!$transaction instanceof WalletTransaction) {

            if ($wallet_id) {

                $wallet = Wallet::where('id', $wallet_id)->first();

                $balance = Helper::getWalletBalance($wallet, $transaction->user);

                $ledger = DB::transaction(function () use ($transaction, $wallet_id, $balance, $description, $refund_ledger_id , $wallet) {

                    $wallet_transaction = WalletTransaction::firstOrCreate(
                        [
                            'quote_id' => $transaction->quote_id,
                            'wallet_id' => $wallet_id,
                            'beneficiary_transaction_id' => $transaction->id
                        ],
                        [
                            'user_id' => $transaction->user_id,
                            'amount' => $transaction->total_amount,
                            'total_amount' => $transaction->total_amount,
                            'fees' => $transaction->commission_amount,
                            'status' => WALLET_TRANSACTION_COMPLETED,
                            'type' => TRANSACTION_TYPE_DEBIT,
                            'balance_before' => $balance,
                            'balance_after' => $balance - $transaction->total_amount,
                        ]
                    );


                    return $wallet_transaction;
                });
            }
        }

         $balance = 0.00;

        if ($transaction->quote) {

            if($quotesource instanceof VirtualAccount) {

                $balance = Helper::bankBalance($transaction->user, $quotesource, $transaction->team_member ?? null);
            }else{

                $balance = Helper::getWalletBalance($quotesource, $transaction->user);
            }
        }else{

            if ($virtual_account_id) {

                $virtual_account = VirtualAccount::where('id', $virtual_account_id)->first();

                $balance = Helper::bankBalance($transaction->user, $virtual_account , $transaction->team_member ?? null);
            }
        }

        $ledger = DB::transaction(function () use ($transaction, $virtual_account_id, $balance, $description, $refund_ledger_id, $wallet_id) {

            $ledger = $transaction->ledger()->firstOrCreate(
                [
                    'transaction_id' => $transaction->id
                ],
                [
                    'user_id' => $transaction->user_id,
                    'virtual_account_id' => $virtual_account_id,
                    'wallet_id' => $wallet_id,
                    'external_type' => $transaction->external_type,
                    'balance' => $balance,
                    'description' => $description,
                    'refund_ledger_id' => $refund_ledger_id
                ]
            );

            return $ledger;
        });
        return $ledger;
    }

    public static function create_refund($transaction)
    {

        if (!$transaction->ledger) {

            return false;
        }

        $already_refunded = Ledger::where('refund_ledger_id', $transaction->ledger->id)->first();

        if ($already_refunded) {

            return false;
        }

        $refund = DB::transaction(function () use ($transaction) {

            $quote = $transaction->quote;

        if(!$quote){

            return false;
        }

        $quotesource = QuoteSourceFactory::resolve($transaction->quote->source_type, $transaction->quote->source_id, $transaction->user);

            if ($quotesource instanceof Wallet) {

                $balance = Helper::getWalletBalance($quotesource, $transaction->user);

                $refund_transaction = WalletTransaction::firstOrCreate(
                    [
                        'wallet_id' => $quotesource->id,
                        'beneficiary_transaction_id' => $transaction->id,
                        'type' => TRANSACTION_TYPE_CREDIT,
                    ],
                    [
                        'user_id' => $transaction->user_id,
                        'quote_id' => $transaction->quote_id,
                        'amount' => $transaction->total_amount,
                        'fees' => 0,
                        'total_amount' => $transaction->total_amount,
                        'balance_before' => $balance,
                        'balance_after' => $balance + $transaction->total_amount,
                        'status' => WALLET_TRANSACTION_COMPLETED
                    ]
                );

            } else {

                $refund_transaction = DepositTransaction::create([

                    'user_id' => $transaction->user_id,
                    'virtual_account_id' => $quotesource->id,
                    'amount' => $transaction->total_amount,
                    'total_amount' => $transaction->total_amount,
                    'status' => DEPOSIT_TRANSACTION_COMPLETED,
                    'type' => DEPOSIT_TYPE_REFUND
                ]);

            }
            throw_if(!$refund_transaction, new Exception(api_error(163), 163));

            Helper::updateLedger($refund_transaction, "Refund for " . $transaction->unique_id, ($transaction->ledger ? $transaction->ledger->id : null));

            return $refund_transaction;
        });

        return $refund;
    }
    public static function get_transaction_mode()
    {

        $transaction_mode = Setting::get('transaction_mode', TRANSACTION_MODE_APPROVAL);

        return $transaction_mode;
    }

    public static function Get_Remitter_Balance($remitter, $user)
    {

        $deposits = DepositTransaction::where('client_reference_id', $remitter->client_reference_id)
            ->where('user_id', $user->id)
            ->where('status', DEPOSIT_TRANSACTION_COMPLETED)
            ->sum('total_amount');

        $payouts = BeneficiaryTransaction::where('sender_id', $remitter->id)
            ->where('user_id', $user->id)
            ->sum('total_amount');

        return $deposits - $payouts;
    }

    public static function bankBalance($user, $virtual_account, $team_member = null)
    {

        $virtualaccount_quotes = Quote::where('source_id', $virtual_account->id)
            ->where('source_type', VirtualAccount::class)
            ->get();

        if ($team_member && $team_member->role == TEAM_MEMBER_ROLE_CORPORATE) {

            $deposits = DepositTransaction::where('virtual_account_id', $virtual_account->id)
                ->where('team_member_id', $team_member->id)
                ->where('user_id', $user->id)
                ->where('status', DEPOSIT_TRANSACTION_COMPLETED)
                ->sum('total_amount');

            $payouts = BeneficiaryTransaction::whereIn('quote_id', $virtualaccount_quotes->pluck('id'))
                ->where('team_member_id', $team_member->id)
                ->where('user_id', $user->id)
                ->sum('total_amount');

            return $deposits - $payouts;
        }

        if ($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYINCOLLECTION) {

            $deposits = DepositTransaction::where('virtual_account_id', $virtual_account->id)
                ->where('user_id', $user->id)
                ->where('status', DEPOSIT_TRANSACTION_COMPLETED)
                ->where('memo', $user->memo)
                ->sum('total_amount');
        } else {

            $deposits = DepositTransaction::where('virtual_account_id', $virtual_account->id)
                ->where('user_id', $user->id)
                ->where('status', DEPOSIT_TRANSACTION_COMPLETED)
                ->sum('total_amount');
        }

        $payouts = BeneficiaryTransaction::whereIn('quote_id', $virtualaccount_quotes->pluck('id'))
            ->where('user_id', $user->id)
            ->sum('total_amount');

        $wallet_transactions = WalletTransaction::query()
            ->join('quotes', 'wallet_transactions.quote_id', '=', 'quotes.id')
            ->whereIn('wallet_transactions.quote_id', $virtualaccount_quotes->pluck('id'))
            ->where('wallet_transactions.user_id', $user->id)
            ->where('wallet_transactions.type', TRANSACTION_TYPE_CREDIT)
            ->sum('quotes.total_sending_amount');


        return $deposits - $payouts - $wallet_transactions;
    }

    public static function getWalletBalance($wallet, $user){

        $total_credited = WalletTransaction::where('wallet_id', $wallet->id)
            ->where('user_id', $user->id)
            ->where('type', TRANSACTION_TYPE_CREDIT)
            ->sum('total_amount');

        $total_debited = WalletTransaction::where('wallet_id', $wallet->id)
            ->where('user_id', $user->id)
            ->where('type', TRANSACTION_TYPE_DEBIT)
            ->sum('total_amount');

        $balance = $total_credited - $total_debited;

        return $balance;
    }

    public static function getAuthUser()
    {
        if (auth()->guard('team')->check()) {
            return auth()->guard('team')->user()->user;
        }

        return auth()->user();
    }

    public static function labelToFieldKey(string $label): string
    {
        return strtolower(
            preg_replace(
                '/[^a-z0-9_]/',
                '',
                str_replace(' ', '_', trim($label))
            )
        );
    }

    public static function buildDropdownValueMap(array $fields): array
    {
        $map = [];

        foreach ($fields as $field) {
            if (empty($field['values_supported'])) {
                continue;
            }

            $section = $field['section'];
            $key     = $field['field_key'];

            foreach ($field['values_supported'] as $option) {
                $label = trim($option['label']);
                $value = $option['value'];

                $map[$section][$key][$label] = $value;
            }
        }

        return $map;
    }

    public static function flattenFormFields(array $form): array
    {
        $flat = [];

        foreach (['quote', 'beneficiary', 'remitter'] as $section) {
            foreach ($form[$section] ?? [] as $field) {

                if (empty($field['field_key'])) {
                    continue;
                }

                $flat[] = array_merge($field, [
                    'section' => $section
                ]);
            }
        }

        return $flat;
    }

    public static function is_remitter_deposit_enabled($user)
    {
        if($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYOUT){

            $merchant_setting = $user->merchant->settings()->where('key', 'enable_remitter_deposit')->first();

            if($merchant_setting && $merchant_setting->value == '1'){

                return true;
            }
        }

        return false;
    }

 public static function get_payment_types(): array
{
    return [
        [
            'label' => 'Payment - Domestic (ACH)',
            'value' => 'BUS_USD_Account.Business_ACH',
        ],
        [
            'label' => 'Payment - Domestic Wire',
            'value' => 'BUS_USD_Account.Domestic_Wire_BUS',
        ],
        [
            'label' => 'Payment - International Wire',
            'value' => 'BUS_USD_Account.BUS_International_Transfer',
        ],
        [
            'label' => 'Payment - Cross Border - SEPA',
            'value' => 'BUS_USD_Account.payment_cross_border_sepa',
        ],
    ];
}

    public static function get_file_update_key($user, $type): array
    {
        if (
            !in_array($user->user_type, [USER_TYPE_BUSINESS, USER_TYPE_INDIVIDUAL], true)
            && $type !== EXTERNAL_TYPE_FVBANK
        ) {
            return ['required_to_update_fields' => 0];
        }

        $doc = UserDocument::where('user_id', $user->id)->latest()->first();

        $businessVerificationType = optional($user->userInformation)->business_verification_type;

        if (!$doc) {
            return ['required_to_update_fields' => 1];
        }

        if ($user->user_type === USER_TYPE_INDIVIDUAL) {

            $missingFields = (empty($doc->document_file) || empty($doc->document_back_file) || empty($doc->document_expiry_date));

            return [
                'required_to_update_fields' => $missingFields ? 1 : 0
            ];
        }


        if ($user->user_type === USER_TYPE_BUSINESS) {

            $missingFields = (empty($doc->document_file) || empty($doc->document_back_file) || empty($doc->document_expiry_date) || empty($businessVerificationType));

            return [
                'required_to_update_fields' => $missingFields ? 1 : 0
            ];
        }

        return ['required_to_update_fields' => 0];
    }

    public static function updateFvBankVirtualAccount($user, $virtual_account)
    {

        $accountNumber = $virtual_account['Account Number'] ?? $virtual_account['Beneficiary Account Number'] ?? null;

        VirtualAccount::updateOrCreate(
            [
                'user_id'                => $user->id,
                'external_type'          => EXTERNAL_TYPE_FVBANK,
                'account_number'         => $accountNumber,
                'account_bank_code'      => $virtual_account['Intermediary Bank SWIFT code'] ?? $virtual_account['BIC'] ?? null,
                'routing_number'         => $virtual_account['Routing Number/ABA'] ?? null,
            ],
            [
                'currency'               => $virtual_account['Currency'] ?? 'USD',
                'account_holder_name'    => $virtual_account['Beneficiary Name'] ?? null,
                'account_holder_address' => $virtual_account['Beneficiary Address'] ?? $virtual_account['Address'] ?? null,
                'account_bank_name'      => $virtual_account['Bank Name'] ?? $virtual_account['Receiving Bank Name'] ?? null,
                'account_bank_address'   => $virtual_account['Bank Address'] ?? $virtual_account['Receiving Bank Address'] ?? null,
                'external_reference_id'  => $virtual_account['Reference/Memo #'] ?? $virtual_account['Account_Number'] ?? null,
                'external_data'          => $virtual_account,
                'status'                 => VIRTUAL_ACCOUNT_STATUS_CREATED,
            ]
        );
    }

    public static function generateUniqueUserMemo($user)
    {
        $name = $user->user_type == USER_TYPE_INDIVIDUAL ? $user->first_name . ' ' . $user->last_name : $user->userInformation->business_name ?? '';

        $prefix = strtoupper(substr($name, 0, 3));

        $suffix = str_pad(rand(0, 9999), 4, '0', STR_PAD_LEFT);
        
        $referenceId = $prefix . $suffix;

        return $referenceId;
    }

    public static function isSupportedUserType($user_type, $merchant)
    {
        $supportedTypes = $merchant->settings()->where('key', 'supported_user_types')->first();

        if ($supportedTypes) {

            if($supportedTypes->value == SUPPORTED_USER_BUSINESS && $user_type != USER_TYPE_BUSINESS) {

                return false;
            }

            if($supportedTypes->value == SUPPORTED_USER_INDIVIDUAL && $user_type != USER_TYPE_INDIVIDUAL) {

                return false;
            }
        }

        return true;
    }

    public static function generateTransactionRefNumber($user)
    {
        if($user->merchant){

            $Id = str_pad($user->merchant->id, 2, '0', STR_PAD_LEFT);
        }else{

            $Id = str_pad($user->id, 2, '0', STR_PAD_LEFT);
        }
        return $Id . now()->format('YmdHisv') . random_int(100, 999);
    }

    public static function validateBankAccountINR($user, $beneficiaryAccount)
    {
        $payload = [
            'account_number' => $beneficiaryAccount->account_number,
            'ifsc'           => $beneficiaryAccount->swift_code,
        ];

        $repository = new BeneficiaryAccountRepository();

        $response   = $repository->validate_account($user, $payload);

        if (!$response) {
            return null;
        }

        $externalStatus = $response->external_status ?? null;

        // switch ($externalStatus) {

        //     case 'account_blocked_frozen':
                    
        //             throw new Exception(api_error(197), 197);
        //         break;

        //     case 'nre_account':

        //         if ($user->merchant) {

        //             $settings = $user->merchant->settings()
        //                 ->where('key', 'supported_accounts')
        //                 ->value('value');

        //             if ($settings) {

        //                 $supportedAccounts = json_decode($settings, true) ?? [];

        //                 if (!in_array('nre', $supportedAccounts, true)) {
        //                     throw new Exception(api_error(198), 198);
        //                 }
        //             }
        //         }
        //         break;
        // }

        return $response;
    }

    public static function get_deposit_lookups($validated)
    {
        if ($validated['type'] == LOOKUP_TYPE_SOURCE_OF_FUNDS) {
            $data = deposit_source_of_fund();
        }

        if ($validated['type'] == LOOKUP_TYPE_PURPOSE_OF_TRANSACTION) {
            $data = deposit_purpose();
        }

        return collect($data)->map(function ($label, $value) {
            return [
                'label' => $label,
                'value' => $value,
            ];
        })->values()->toArray();
    }

    public static function MaskData($data)
    {
        $length = strlen($data);

        if ($length <= 2) {
            return str_repeat('*', $length);
        }

        return substr($data, 0, 1)
            . str_repeat('*', $length - 2)
            . substr($data, -1);
    }
    public static function processTransaction($transaction)
    {
        if ($transaction->status == BENEFICIARY_TRANSACTION_APPROVED) {

            if (Setting::get('compliance_panel') == ENABLED) {

                app(ComplianceService::class)->make($transaction, $transaction->user);
            } else {

                app(ProcessingUnit::class)->make($transaction, $transaction->user);
            }
        }
    }

    public static function notifyAccounts($depositTransaction)
    {

        $user = $depositTransaction->user;

        if (!$user->merchant) {
            return false;
        }

        $merchant_setting = $user->merchant->settings()->where('key', 'enable_accounts')->first();

        if ($merchant_setting && $merchant_setting->value == '0') {

            return false;
        }

        $user = User::where('email', "admin@lulu.com")->first();

        $accounts = DepositTransactionsAccount::create([
            'user_id' => $user->id,
            'currency' => $depositTransaction->virtualAccount->currency ?? null,
            'total_amount' => $depositTransaction->total_amount,
            'status' => DEPOSIT_TRANSACTION_PENDING,
        ]);

        app(InvoiceMate::class)->makeDeposit($depositTransaction, $depositTransaction->user, $accounts);

        return $accounts;
    }
}



