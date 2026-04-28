<?php

namespace App\Helpers;

use App\Models\Lookup;
use App\Models\MobileCountryCode;
use App\Models\SupportedCountry;
use App\Models\User;
use App\Models\UserDocument;
use Exception;
use Illuminate\Support\Facades\Cache;

class FieldsHelper
{

    public static function get_states($country_code = null)
    {
        $states = Helper::get_states($country_code);

        if (!$country_code) {

            $states = array_map(function ($state) {

                $state['parent_value'] = $state['country_code'];

                unset($state['country_code']);

                return $state;
            }, $states);
        }

        return $states;
    }

    public static function make($key, $label, $type = 'string', $mandatory = true, $editable = true, $validation = [], $category = '', $values = [], $children = [], $repeatable = false, $parent_key = '', $required_if_empty_of = "", $required_if = "")
    {
        return [
            "field_key" => $key,
            "field_label" => $label,
            "field_type" => $type,
            "is_mandatory" => $mandatory,
            "is_editable" => $editable,
            "validation" => $validation,
            "category" => $category,
            "values_supported" => $values,
            "children" => $children,
            "is_repeatable" => $repeatable,
            "field_value" => "",
            "parent_key" => $parent_key,
            "required_if_empty_of" => $required_if_empty_of,
            'required_if' => $required_if
        ];
    }
    public static function validations()
    {
        return [
            'name' => [
                "min_length" => 1,
                "max_length" => 100,
                "regex" => '/^(?=.{1,100}$)[A-Za-z]+(?:[ \'-]+[A-Za-z]+)*$/'
            ],
            'business_name' => ["min_length" => 2, "max_length" => 100, "regex" => '/^[A-Za-z0-9 .,&()-]{1,100}$/'],
            'email' => ["min_length" => 2, "max_length" => 100, "regex" => "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[A-Za-z]{2,}$/"],
            'swift' => ["min_length" => 8, "max_length" => 11, "regex" => '/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/'],
            'routing' => ["min_length" => 9, "max_length" => 9, "regex" => '/^[0-9]{9}$/'],
            'iban' => ["min_length" => 15, "max_length" => 34, "regex" => '/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/'],
            'text' => ["min_length" => 2, "max_length" => 100],
            'website' => ['min_length' => 2, 'max_length' => 100, 'regex' => '/^https:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/[^\s?#]*)?(\?[^\s#]*)?(#[^\s]*)?$/'],
            'mobile' => ["min_length" => 6, "max_length" => 50, "regex" => '/^\d{6,15}$/'],
            'id_number' => ['min_length' => 6, 'max_length' => 20,'regex' => '/^[A-Za-z0-9]{6,20}$/'],
            'ifsc' => ["min_length" => 11, "max_length" => 11, "regex" => '/^[A-Z]{4}0[A-Z0-9]{6}$/'],
            'postal_code' => ["min_length" => 4, "max_length" => 10, "regex" => '/^[A-Za-z0-9][A-Za-z0-9\s-]{3,9}$/'],
            'bangladesh_account_number' => ["min_length" => 10, "max_length" => 17, "regex" => '/^[0-9]{10,17}$/'],
            'address' => ["min_length" => 2, "max_length" => 85, "regex" => '/^[A-Za-z0-9\s,.\-\/()#]{2,85}$/'],
            'city' => ["min_length" => 2, "max_length" => 50, "regex" => '/^[A-Za-z]+(?:[ \'-][A-Za-z]+)*$/'],
            'password' => ["min_length" => 8, "max_length" => 20, "regex" => passwordRegex()],
            'aba' => ["min_length" => 9, "max_length" => 9, "regex" => '/^[0-9]{9}$/'],
        ];
    }

    public static function addressFields($prefix = null , $states, $countries )
    {
        if ($prefix == "receiver") {

            $category = "Address";
        } else {

            $category = ucfirst(str_replace('_', ' ', $prefix)) . ' Address';
        }

        return [
            self::make("{$prefix}_address_line_1", "$category Line 1", 'string', true, true, self::validations()['address'], $category),
            self::make("{$prefix}_address_line_2", "$category Line 2", 'string', false, false, self::validations()['address'], $category),
            self::make("{$prefix}_country", "$category Country", 'string', true, true, [], $category, $countries, [], false, ""),
            self::make("{$prefix}_state", "$category State", 'string', true, true, [], $category, $states, [], false, "{$prefix}_country" ),
            self::make("{$prefix}_postal_code", "$category Postal Code", 'string', true, true, self::validations()['postal_code'], $category),
            self::make("{$prefix}_city", "$category City", 'string', true, true, self::validations()['city'], $category),
        ];
    }

    public static function baseIndividualFields($mobile_country_codes, $countries, $states)
    {
        $validations = self::validations();

        $address_types = Helper::get_lookups(LOOKUP_TYPE_ADDRESS_TYPES) ?? [];

        return [
            self::make("first_name", "First Name", "string", true, true, $validations['name']),
            self::make("middle_name", "Middle Name", "string", false, false, $validations['name']),
            self::make("last_name", "Last Name", "string", true, true, $validations['name']),
            self::make("email", "Email", "string", true, true, $validations['email']),
            self::make("mobile_country_code", "Mobile Country Code", "string", true, true, [], '', $mobile_country_codes),
            self::make("mobile", "Mobile", "string", true, false, $validations['mobile']),
            ...self::addressFields('receiver', $states, $countries),
        ];
    }

    public static function baseBusinessFields($mobile_country_codes, $countries, $states)
    {
        $validations = self::validations();

        return [
            self::make("business_name", "Business Name" , 'string', true, true, self::validations()['business_name']),
            self::make("business_country", "Business Country", 'string', true, false, [], "", $countries),
            self::make("email", "Email", "string", true, true, self::validations()['email']),
            self::make("mobile_country_code", "Mobile Country Code", 'string', true, true, [], "", $mobile_country_codes),
            self::make("mobile", "Mobile", 'string', true, false, $validations['mobile']),
            ...self::addressFields('receiver', $states, $countries),
        ];
    }

    public static function fileValidation(): array
    {
        return [
            "accepted_extensions" => [
                "image/jpeg",
                "image/png",
                "image/jpg",
                "application/pdf",
            ],
            "max_file_size" => 5 * 1024 * 1024,
        ];
    }


    public static function documentGroup($key, $label, $countries = [], $types = []): array
    {
        return [
            "field_key" => $key,
            "field_label" => $label,
            "field_type" => "group",
            "is_mandatory" => true,
            "is_editable" => true,
            "is_repeatable" => false,
            "category" => $label,
            "children" => array_values(array_filter([
                !empty($types) ? self::make("document_type", "Document Type", "string", true, true, [], '', $types) : null,
                !empty($countries) ? self::make("document_country", "Document Issuing Country", "string", true, true, [], '', $countries) : null,
                self::make("document_file", "Document Front File", "file", true, true, self::fileValidation()),
                self::make("document_back_file", "Document Back File", "file", false, true, self::fileValidation()),
                self::make("document_expiry_date", "Document Expiry Date",  "date", false, true, ["min_date" => now()->format('Y-m-d')]),
            ])),
            "is_repeatable" => false,
            "validation" => [],
            "values_supported" => [],
        ];
    }

    public static function onboardingFormFields($user, $step)
    {
        $user_type = $user->user_type;

        $mobile_country_codes = Helper::get_mobile_country_codes();

        $states = self::get_states();

        $countries = Helper::get_countries();

        $steps = [
            ONBOARDING_STEP_ONE => [
                USER_TYPE_INDIVIDUAL => self::registrationFormFields($mobile_country_codes),
                USER_TYPE_BUSINESS   => self::registrationFormFields($mobile_country_codes),
            ],
            ONBOARDING_STEP_TWO => [
                USER_TYPE_INDIVIDUAL => self::individualOnboardingFields($countries, $states),
                USER_TYPE_BUSINESS   => self::businessOnboardingFields($countries, $states, $mobile_country_codes),
            ],
            ONBOARDING_STEP_THREE => [
                USER_TYPE_INDIVIDUAL => self::getDocumentGroups($user_type, $countries),
                USER_TYPE_BUSINESS   => self::getDocumentGroups($user_type, $countries),
            ],
        ];

        return $steps[$step][$user_type] ?? [];
    }


    public static function onboardingFormFields_new($user, $validated)
    {
        $step = $validated['type'] ;

        $countryCode = $user->userInformation->country ?? null;
        
        $mobile_country_codes = Helper::get_mobile_country_codes();

        $states = self::get_states();

        $countries = Helper::get_countries();

        if ($countryCode) {

            $config = Lookup::findValuebyKey( $countryCode, LOOKUP_TYPE_COUNTRY_CONFIGURATIONS );

            if (!empty($config)) {

                $config = json_decode($config, true);

                if (is_array($config)) {

                    if ($step === ONBOARDING_STEP_TWO && $user->user_type === USER_TYPE_BUSINESS) {

                        return self::businessOnboardingFieldsByCountry($config);
                    }

                    if ($step === ONBOARDING_STEP_THREE && $user->user_type === USER_TYPE_BUSINESS) {

                        return self::businessDocumentsbyCountry($config);
                    }
                }
            }
        }


        $steps = [
            ONBOARDING_STEP_ONE => [
                USER_TYPE_INDIVIDUAL => self::registrationFormFields($mobile_country_codes),
                USER_TYPE_BUSINESS   => self::registrationFormFields($mobile_country_codes),
            ],
            ONBOARDING_STEP_TWO => [
                USER_TYPE_INDIVIDUAL => self::individualOnboardingFields($countries, $states),
                USER_TYPE_BUSINESS   => self::businessOnboardingFields($countries,$states,$mobile_country_codes ),
            ],
            ONBOARDING_STEP_THREE => [
                USER_TYPE_INDIVIDUAL => self::getDocumentGroups($user->user_type, $countries),
                USER_TYPE_BUSINESS   => self::getDocumentGroups($user->user_type, $countries),
            ],
        ];

        return $steps[$step][$user->user_type] ?? [];
    }


    private static function businessOnboardingFieldsByCountry($config)
    {
        $fields = [];

        if (!empty($config['taxIdLabel'])) {
            $fields[] = self::make('tax_id', $config['taxIdLabel'], 'string', true, true, !empty($config['taxIdFormat']) 
                    ? ['regex' => $config['taxIdFormat']]
                    : []
            );
        }

        if (!empty($config['vatRequired'])) {
            $fields[] = self::make('vat_number', $config['vatLabel'], 'string', true, true, !empty($config['vatFormat'])
                    ? ['regex' => $config['vatFormat']]
                    : []
            );
        }

        if (!empty($config['registrationNumberLabel'])) { $fields[] = self::make('registration_number', $config['registrationNumberLabel'],
                'string',
                true,
                true
            );
        }

        if (!empty($config['hasStates'])) { $fields[] = self::make( 'state', $config['stateLabel'] ?? 'State', 'string', true,true, [],'',
                $config['states'] ?? [],
                [],
                false,
                'country'
            );
        }

        foreach ($config['additionalFields'] ?? [] as $field) {
            $fields[] = self::make(
                $field['fieldName'],
                $field['label'],
                $field['type'],
                $field['required'],
                true,
                !empty($field['format']) ? ['regex' => $field['format']] : [],
                '',
                $field['options'] ?? []
            );
        }

        return $fields;
    }

    private static function businessDocumentsbyCountry($config)
    {
        $fields = [];
        
        if (!empty($config['requiredDocuments']) && is_array($config['requiredDocuments'])) {

            foreach ($config['requiredDocuments'] as $docCode) {

            $fields[] = self::documentGroup( 'document_' . strtolower($docCode), 

                    self::documentLabel($docCode),$config['countryCode'], self::documentLabel($docCode) );
            }
        }

        return $fields;
    }


    private static function documentLabel(string $code): string
    {
        return ucwords(strtolower(str_replace('_', ' ', $code)));
    }



    public static function getDocumentGroups($user_type, $countries): array
    {
        $proofOfAddress = Helper::get_lookups(LOOKUP_TYPE_PROOF_OF_ADDRESS) ?? [];

        $idTypes = Helper::get_lookups(LOOKUP_TYPE_ID_TYPE) ?? [];

        $sourceOfFunds = Helper::get_lookups(LOOKUP_TYPE_SOURCE_OF_FUNDS) ?? [];

        if ($user_type == USER_TYPE_INDIVIDUAL) {

            return [
                self::documentGroup('proof_of_address', 'Proof of Address', $countries, $proofOfAddress),
                self::documentGroup('id_document', 'ID Document', $countries, $idTypes),
                self::documentGroup('source_of_funds', 'Source of Funds', [], $sourceOfFunds),
            ];
        } else {

            return [
                self::documentGroup('proof_of_address', 'Proof of Address', $countries, $proofOfAddress),
                self::documentGroup('proof_of_ownership', 'Proof of Ownership', $countries),
                self::documentGroup('source_of_funds', 'Source of Funds', [], $sourceOfFunds),
            ];
        }
    }

    private static function registrationFormFields($mobile_country_codes)
    {
        $validations = self::validations();

        return [
            self::make("user_type", "User Type", "string", true, true, [], '', [
                [
                    "label" => user_type_label(USER_TYPE_INDIVIDUAL),
                    "value" => user_type_label(USER_TYPE_INDIVIDUAL),
                ],
                [
                    "label" => user_type_label(USER_TYPE_BUSINESS),
                    "value" => user_type_label(USER_TYPE_BUSINESS),
                ]
            ]),
            self::make("email", "Email", "string", true, true, $validations['email']),
            self::make("password", "Password", "string", true, true, $validations['password']),
            self::make("mobile_country_code", "Mobile Country Code", "string", true, true, [], "", $mobile_country_codes),
            self::make("mobile", "Mobile", "string", true, false, $validations['mobile']),
            self::make("device_type", "Device Type", "string", false, true, [], '', [
                ["label" => "Android", "value" => DEVICE_TYPE_ANDROID],
                ["label" => "IOS", "value" => DEVICE_TYPE_IOS],
                ["label" => "Web", "value" => DEVICE_TYPE_WEB],
            ]),
        ];
    }

    private static function individualOnboardingFields($countries, $states)
    {
        $validations = self::validations();

        $professions = Helper::get_lookups(LOOKUP_TYPE_PROFESSION) ?? [];

        $sourcesofIncome = Helper::get_lookups(LOOKUP_TYPE_SOURCE_OF_INCOME) ?? [];

        return [
            self::make("title", "Title", "string", true, true, [], '', [
                ["label" => "Mr", "value" => "Mr"],
                ["label" => "Mrs", "value" => "Mrs"],
                ["label" => "Miss", "value" => "Miss"],
            ]),
            self::make("first_name", "First Name", "string", true, true, $validations['name']),
            self::make("middle_name", "Middle Name", "string", false, true, $validations['name']),
            self::make("last_name", "Last Name", "string", true, true, $validations['name']),
            self::make("dob", "Date of Birth", "date", true, true, ["max_date" => now()->subYears(18)->subDay()->format('Y-m-d')]),
            self::make("gender", "Gender", "string", true, true, [], '', [
                ["value" => GENDER_MALE, "label" => "Male"],
                ["value" => GENDER_FEMALE, "label" => "Female"],
                ["value" => GENDER_OTHER, "label" => "Others"],
            ]),
            self::make("address_1", "Address Line 1", "string", true, true, $validations['address']),
            self::make("address_2", "Address Line 2", "string", true, true, $validations['address']),
            self::make("country", "Country", "string", true, true, [], "", $countries),
            self::make("state", "State / Province", "string", true, true, [], "", $states, [], false, "country"),
            self::make("city", "City", "string", true, true, $validations['city']),
            self::make("postal_code", "Postal Code", "string", true, true, $validations['postal_code']),
            self::make("purpose_of_transactions", "Purpose of Transactions", "string", true, true, [], "", Helper::get_lookups(LOOKUP_TYPE_PURPOSE_OF_TRANSACTION) ?? []),
            self::make("id_type", "ID Type", "string", true, true, [], "", Helper::get_lookups(LOOKUP_TYPE_ID_TYPE) ?? []),
            self::make("id_number", "ID Number", "string", true, true, $validations['id_number']),
            self::make("profession", "Profession", "string", true, true, [], "", $professions),
            self::make("source_of_income", "Source of Income", "string", true, true, [], "", $sourcesofIncome),
        ];
    }

    private static function businessOnboardingFields($countries, $states, $mobile_country_codes)
    {
        $validations = self::validations();

        $typesOfBusiness = Helper::get_lookups(LOOKUP_TYPE_BUSINESS_TYPE) ?? [];

        $typesOfBusinessVerification = Helper::get_lookups(LOOKUP_BUSINESS_VERIFICATION_TYPES) ?? [];

        $professions = Helper::get_lookups(LOOKUP_TYPE_PROFESSION) ?? [];

        return [
            self::make("legal_name", "Legal Name", "string", true, true, $validations['business_name']),
            self::make("tax_id", "Tax ID Number", "string", true, true, $validations['id_number']),
            self::make("country_of_incorporation", "Country  of Incorporation", "string", true, true, [], "", $countries),
            self::make("formation_date", "Formation Date", "date", true, true, ["max_date" => now()->format('Y-m-d')]),
            self::make("business_name", "Business Name", "string", true, true, $validations['business_name']),
            self::make("type_of_business", "Type of Business", "string", true, true, [], "", $typesOfBusiness),
            self::make("website", "Website", "string", true, true, $validations['website']),
            self::make("address_1", "Address Line 1", "string", true, true, $validations['address']),
            self::make("address_2", "Address Line 2", "string", true, true, $validations['address']),
            self::make("country", "Country", "string", true, true, [], "", $countries),
            self::make("state", "State / Province", "string", true, true, [], "", $states, [], false, "country"),
            self::make("city", "City", "string", true, true, $validations['city']),
            self::make("postal_code", "Postal Code", "string", true, true, $validations['postal_code']),
            self::make("business_verification_type", "Business Verification Type", "string", true, true, [], "", $typesOfBusinessVerification),
            self::make("owners", "Business Owners", "group", true, true, ["min_length" => 1, "max_length" => 3], "", [], [
                self::make("first_name", "First Name", "string", true, true, $validations['name']),
                self::make("last_name", "Last Name", "string", true, true, $validations['name']),
                self::make("dob", "Date of Birth", "date", true, true, ["max_date" => now()->subYears(18)->subDay()->format('Y-m-d')]),
                self::make("id_type", "ID Type", "string", true, true, [], "", Helper::get_lookups(LOOKUP_TYPE_ID_TYPE) ?? []),
                self::make("id_number", "ID Number", "string", true, true, $validations['id_number']),
                self::make("email", "Email", "string", true, true, $validations['email']),
                self::make("mobile_country_code", "Mobile Country Code", "string", true, true, [], "", $mobile_country_codes),
                self::make("mobile", "Mobile", "string", true, false, $validations['mobile']),
                self::make("profession", "Profession", "string", true, true, [], "", $professions),
                self::make("address_1", "Address Line 1", "string", true, true, $validations['address']),
                self::make("address_2", "Address Line 2", "string", false, true, $validations['address']),
                self::make("country", "Country", "string", true, true, [], "", $countries),
                self::make("state", "State", "string", true, true, [], "", $states, [], false, "country"),
                self::make("city", "City", "string", true, true, $validations['city']),
                self::make("postal_code", "Postal Code", "string", true, true, $validations['postal_code']),
            ], true),
        ];
    }

    public static function beneficiary_form_fields($payload, $user = null)
    {

        $merchantId = optional($user?->merchant)->id ?? 'default';

        $cacheKey = sprintf(
            'beneficiary_form_fields:%s:%s:%s:%s',
            $payload['country'],
            $payload['currency'],
            $payload['type'],
            $merchantId
        );

        return Cache::remember(
            $cacheKey,
            now()->addHours(6),
            function () use ($payload, $user) {

                $supportedCountry = SupportedCountry::supported()->where('country_code', $payload['country'])->where('currency', $payload['currency'])->first();

                throw_if(!$supportedCountry, new Exception("Country not supported", 400));

                $states = self::get_states();

                $countries = Helper::get_countries();

                $mobile_country_codes = Helper::get_mobile_country_codes();

                $validations = self::validations();

                $bankAddress = self::addressFields('bank', $states, $countries);

                $receiverAddress = self::addressFields('receiver', $states, $countries);

                $base = [];

                switch ($payload['type']) {

                    case USER_TYPE_INDIVIDUAL:

                        $base = self::baseIndividualFields($mobile_country_codes, $countries, $states);

                        break;
                    case USER_TYPE_BUSINESS:

                        $base = self::baseBusinessFields($mobile_country_codes, $countries, $states);

                        break;

                    default:
                        return [];
                }

                $base[] = self::make("account_name", "Account Name", "string", true, true, $validations['business_name']);

                $additionalFields = self::bankFieldsByCountry($supportedCountry->country_code, $payload['currency'], $bankAddress);

                if ($supportedCountry && $supportedCountry->currency == "USD") {

                    $additionalFields[] = self::make("intermediary_bank_name", "Intermediary Bank Name", "string", false, true, $validations['name'], "", [], [], false, "", "", "code");
                    $additionalFields[] = self::make("intermediary_bank_swift_code", "Intermediary Bank Swift Code", "string", false, true, $validations['swift'], "", [], [], false, "", "", "");
                    $additionalFields[] = self::make("intermediary_bank_aba", "Intermediary Bank ABA", "string", false, true, $validations['aba'], "", [], [], false, "", "", "code");
                    $additionalFields[] = self::make("intermediary_bank_address", "Intermediary Bank Address", "string", false, true, $validations['address'], "", [], [], false, "", "", "");
                    $additionalFields[] = self::make("intermediary_bank_city", "Intermediary Bank City", "string", false, true, $validations['city'], "", [], [], false, "", "", "");
                    $additionalFields[] = self::make("intermediary_bank_country", "Intermediary Bank Country", "string", false, true, [], "", $countries, [], false, "", "", "");
                    $additionalFields[] = self::make("intermediary_bank_state", "Intermediary Bank State", "string", false, true, [], "", $states, [], false, "intermediary_bank_country", "", "");
                    $additionalFields[] = self::make("intermediary_bank_postal_code", "Intermediary Bank Postal Code", "string", false, true, $validations['postal_code'], "", [], [], false, "", "", "");
                }

                if ($supportedCountry && $supportedCountry->external_type == EXTERNAL_TYPE_DIGININE) {

                    $isServiceBankRquired = false;

                    if(in_array($supportedCountry->country_code, ['NPL','PAK'])) {

                        $isServiceBankRquired = true;
                    }

                    $additionalFields[] = self::make("service_bank", "Service Bank", "string", $isServiceBankRquired, true, [], "", Helper::get_service_banks($payload['country'], $payload['currency']) ?? []);
                } else {

                    $additionalFields[] = self::make("bank_name", "Bank Name", "string", true, true, $validations['name']);
                }

                $additionalFields[] = self::make("purpose_of_transaction", "Purpose of Transactions", "string", true, true, [], "", Helper::get_lookups(LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS, EXTERNAL_TYPE_DIGININE) ?? []);

                $formfields = array_merge($base, $additionalFields);

                if ($user && $user->merchant) {

                    $merchant_setting = $user->merchant->settings()->where('key', 'beneficiary_fields')->first();

                    $merchantFieldKeys = [];

                    if ($merchant_setting && !empty($merchant_setting->value)) {

                        $merchantFieldKeys = json_decode($merchant_setting->value, true) ?? [];

                        if (!empty($merchantFieldKeys)) {

                            $formfields = filter_non_mandatory_fields($formfields, $merchantFieldKeys);
                        }
                    }
                }

                if ($supportedCountry?->currency === "USD") {
                    
                    $formfields = collect($formfields)->map(function ($field) {
                        if ($field['field_key'] === "bank_name") {
                            $field['is_mandatory'] = true;
                        }
                        return $field;
                    })->all();
                }

                return $formfields;
            }
        );
    }
    public static function sender_fields($type, $user = null)
    {
        $user = $user ?: Helper::getAuthUser();

        $merchantId = optional($user?->merchant)->id ?? 'default';

        $depositEnabled = Helper::is_remitter_deposit_enabled($user) ? 'deposit_on' : 'deposit_off';

        $cacheKey = sprintf(
            'sender_fields:%s:%s:%s',
            $type,
            $merchantId,
            $depositEnabled
        );

        return Cache::remember($cacheKey, now()->addHours(6), function () use ($type, $user) {

            $validations = self::validations();

            $states = self::get_states();

            $countries = Helper::get_countries();

            $mobile_country_codes = Helper::get_mobile_country_codes();

            $sourceOfFunds = Helper::get_lookups(LOOKUP_TYPE_SOURCE_OF_FUNDS) ?? [];

            $extraSourceOfFunds = Helper::get_lookups(LOOKUP_TYPE_EEC_PAYMENT_PURPOSE) ?? [];

            $totalSourceOfFunds = array_merge($sourceOfFunds, $extraSourceOfFunds);

            $idTypes = Helper::get_lookups(LOOKUP_TYPE_ID_TYPE, EXTERNAL_TYPE_DIGININE) ?? [];

            $common = [
                self::make("email", "Email", "string", true, true, $validations['email']),
                self::make("mobile_country_code", "Mobile Country Code", "string", true, true, [], '', $mobile_country_codes),
                self::make("mobile", "Mobile", "string", true, false, $validations['mobile']),
                self::make("address_1", "Address", "string", true, true, $validations['address']),
                self::make("country", "Country", "string", true, true, [], "", $countries),
                self::make("nationality", "Nationality", "string", true, true, [], "", $countries),
                self::make("state", "State / Province", "string", true, true, [], "", $states, [], false, "country"),
                self::make("city", "City", "string", true, true, $validations['city']),
                self::make("postal_code", "Postal Code", "string", true, true, $validations['postal_code']),
                self::make("source_of_funds", "Source of Funds", "string", true, true, [], "", $totalSourceOfFunds),
                self::make("id_type", "ID Type", "string", true, true, [], "", $idTypes),
                self::make("id_number", "ID Number", "string", true, true, $validations['id_number']),
            ];

            $user = Helper::getAuthUser();

            if (Helper::is_remitter_deposit_enabled($user)) {
                $common[] = self::make("client_reference_id", "Client Reference ID", "string", true, true, []);
            }

            if ($type == USER_TYPE_INDIVIDUAL) {

                $individual = [
                    self::make("first_name", "First Name", "string", true, true, $validations['name']),
                    self::make("middle_name", "Middle Name", "string", false, true, $validations['name']),
                    self::make("last_name", "Last Name", "string", true, true, $validations['name']),
                    self::make("dob", "Date of Birth", "date", true, true, ["max_date" => now()->subYears(18)->format('Y-m-d')]),
                ];

                $formfields = array_merge($individual, $common);
            }

            if ($type == USER_TYPE_BUSINESS) {

                $business = [
                    self::make("business_name", "Business Name", "string", true, true, $validations['business_name']),
                ];

                $professions = Helper::get_lookups(LOOKUP_TYPE_PROFESSION) ?? [];

                $owners = [
                    self::make("owners", "Business Owners", "group", true, true, ["min_length" => 1, "max_length" => 3], "", [], [
                        self::make("first_name", "First Name", "string", true, true, $validations['name']),
                        self::make("last_name", "Last Name", "string", true, true, $validations['name']),
                        // self::make("dob", "Date of Birth", "date", true, true, ["max_date" => now()->subYears(18)->format('Y-m-d')]),
                        self::make("id_type", "ID Type", "string", true, true, [], "", Helper::get_lookups(LOOKUP_TYPE_ID_TYPE) ?? []),
                        self::make("id_number", "ID Number", "string", true, true, $validations['id_number']),
                        self::make("email", "Email", "string", false, true, $validations['email']),
                        self::make("mobile_country_code", "Mobile Country Code", "string", false, true, [], "", $mobile_country_codes),
                        self::make("mobile", "Mobile", "string", false, false, $validations['mobile']),
                        self::make("address_1", "Address Line 1", "string", true, true, $validations['address']),
                        self::make("address_2", "Address Line 2", "string", false, true, $validations['address']),
                        self::make("country", "Country", "string", true, true, [], "", $countries),
                        self::make("nationality", "Nationality", "string", true, true, [], "", $countries),
                        self::make("state", "State", "string", false, true, [], "", $states, [], false, "country"),
                        self::make("city", "City", "string", false, true, $validations['city']),
                        self::make("postal_code", "Postal Code", "string", false, true, $validations['postal_code']),
                        self::make("designation", "Designation", "string", true, true, [], "", $professions),
                    ], true),
                ];

                $document_types = Helper::get_lookups(LOOKUP_TYPE_DOCUMENT_TYPES) ?? [];

                $documents = [
                    self::documentGroup('proofs', 'Proofs', [], $document_types),
                ];

                $formfields = array_merge($business, $common, $documents, $owners);
            }

            if ($user && $user->merchant) {

                $merchant_setting = $user->merchant->settings()->where('key', 'remitter_fields')->first();

                $merchantFieldKeys = [];

                if ($merchant_setting && !empty($merchant_setting->value)) {

                    $merchantFieldKeys = json_decode($merchant_setting->value, true) ?? [];

                    $formfields = filter_non_mandatory_fields($formfields, $merchantFieldKeys);
                }
            }

            return $formfields;
        });
    }

    public static function transaction_form_fields_old($user = null)
    {

        $is_supporting_document_required = true;

        if ($user && $user->merchant) {

            $merchant_setting = $user->merchant->settings()->where('key', 'is_supporting_document_required')->first();

            if ($merchant_setting && $merchant_setting->value == '0') {

                $is_supporting_document_required = false;
            }
        }

        $formfields = [
            self::make("quote_id", "Quote ID", "string", true, true, [], "", []),
            self::make('remarks', 'Remarks', 'string', true, true, [], '', []),
            self::make('client_reference_id', 'Client Reference ID', 'string', false, false, [], '', []),
            self::make('supporting_document', 'Supporting Document', 'file', $is_supporting_document_required, true, self::fileValidation()),
            self::make('txn_ref_no','Transaction Reference Number', 'string', false, false, [], '', [])
        ];



        return $formfields;
    }


    public static function transaction_form_fields($user = null , $type = null, $country = null)
    {
       
        $isSupportingDocumentRequired = self::merchantSettingEnabled($user,'is_supporting_document_required',true);

        $isRemarksRequired = self::merchantSettingEnabled($user, 'is_remarks_required', true );

        $isInvoiceRequired = self::merchantSettingEnabled( $user, 'is_invoice_required', true );

        $isPurposeOfPaymentRequired = self::merchantSettingEnabled($user, 'is_purpose_of_payment_required', false );

        $isTransactionRefRequired = self::merchantSettingEnabled($user, 'is_transaction_reference_no_required', false );

        $isB2B = $type == B2B;

        $isUSA = strtoupper($country) === 'USA';

        $isSupportingDocumentRequired = $isSupportingDocumentRequired || $isB2B || $isUSA;

        return [

            self::make("quote_id", "Quote ID", "string", true, true, [], "", []),

            self::make('remarks','Remarks', 'string', $isRemarksRequired, true, [],'', [] ),

            self::make('client_reference_id','Client Reference ID','string',false, false, [], '',[] ),

            self::make('purpose_of_payment','Purpose of Payment','string', $isPurposeOfPaymentRequired, true, [], '', Helper::get_lookups(LOOKUP_TYPE_EEC_PAYMENT_PURPOSE) ?? [] ),

            self::make('supporting_document', 'Supporting Document', 'file', $isSupportingDocumentRequired,true, self::fileValidation()),

            self::make('txn_ref_no','Transaction Reference Number', 'string', $isTransactionRefRequired, false, [], '', []),
        ];
    }



    protected static function merchantSettingEnabled($user, string $key, bool $default = true): bool
    {
        if (!$user || !$user->merchant) {

            return $default;
        }

        $value = $user->merchant->settings()->where('key', $key)->value('value');

        return is_null($value) ? $default : (bool) $value;
    }


    public static function QuoteFormFields(){
        return [
            self::make("amount", "Amount", "string", true, true, [], "", []),
            self::make("remarks", "Remarks", "string", false, true, [], "", []),
            self::make('txn_ref_no', 'Transaction Reference Number', 'string', true, false, [], '', [])
        ];
    }


    public static function bankRegex(): array
    {
        return [
            'swift' => ['min_length' => 8, 'max_length' => 16, 'regex' => '/^[A-Za-z0-9]{8,16}$/'],
            'hk_bank' => ['min_length' => 3, 'max_length' => 3, 'regex' => '/^\d{3}$/'],
            'hk_account' => ['min_length' => 6, 'max_length' => 9, 'regex' => '/^\d{6,9}$/'],
            'iban' => ['min_length' => 15, 'max_length' => 34, 'regex' => '/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/'],
            'india_account_number' => ["min_length" => 9, "max_length" => 18, "regex" => '/^\d{9,18}$/'],
            'ifsc' => ["min_length" => 11, "max_length" => 11, "regex" => '/^[A-Z]{4}0[A-Z0-9]{6}$/'],
            'lka_bank' => ["min_length" => 4, "max_length" => 4, "regex" => '/^\d{4}$/'],
            'sri_lanka_account_number' => ["min_length" => 6, "max_length" => 15, "regex" => '/^\d{6,15}$/'],
            'nepal_account_number' => ["min_length" => 10, "max_length" => 18, "regex" => '/^[0-9]{10,18}$/'],
            'pak_iban' => ["min_length" => 24, "max_length" => 24, "regex" => '/^[A-Z]{2}[0-9]{2}[A-Z]{4}[A-Z0-9]{16}$/'],
            'routing' => ["min_length" => 9, "max_length" => 9, "regex" => '/^[0-9]{9}$/'],
            'brstn' => ["min_length" => 8, "max_length" => 12, "regex" => '/^[a-zA-Z0-9]{8,12}$/'],
            'phl_account_number' => ["min_length" => 6, "max_length" => 18, "regex" => '/^\d{6,18}$/'],
            'generic_account' => ["min_length" => 4, "max_length" => 34, "regex" => '/^[A-Za-z0-9]{4,34}$/'],
            'usa_account_number' => [ 'min_length' => 4, 'max_length' => 17, 'regex' => '/^[0-9]{4,17}$/'],
        ];
    }

    public static function bankFieldsByCountry(string $country, string $currency, array $bankAddress = []): array
    {

        $regexRules = self::bankRegex();

        $accountTypeField = self::make("account_type", "Account Type", "string", true, true, [], "", Helper::get_account_types() ?? []);

        $isForeignCurrency = false;

        if($currency == 'USD' && $country != 'USA'){

            $isForeignCurrency = true;
        }

        switch (strtoupper($country)) {

            case 'HKG':

                if ($isForeignCurrency) {

                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                    ];
                } else {
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "Branch Code", "string", true, true, $regexRules['hk_bank'])
                    ];
                }
            case 'IND':

                if ($isForeignCurrency) {
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                    ];
                } else {
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "IFSC Code", "string", true, true, $regexRules['ifsc'])
                    ];
                }
            case 'ARE':

                return [
                    $accountTypeField,
                    self::make("account_number", "IBAN", "string", true, true, $regexRules['generic_account']),
                    self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                ];
            case 'LKA':

                if($isForeignCurrency){

                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                    ];
                } else {

                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "Bank Code", "string", true, true, $regexRules['lka_bank'])
                    ];
                }
            case 'NPL':
                return [
                    $accountTypeField,
                    self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                    self::make("code", "SWIFT/BIC", "string", false, true, $regexRules['swift'])
                ];
            case 'PAK':
                return [
                    $accountTypeField,
                    self::make("account_number", "iban", "string", true, true, $regexRules['generic_account']),
                    self::make("code", "Code", "string", false, true, $regexRules['swift'])
                ];
            case 'BGD':
                if ($isForeignCurrency) {
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                    ];
                } else {
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("routing_number", "Routing Number", "string", true, true, $regexRules['routing'])
                    ];
                }
            case 'PHL':
                if($isForeignCurrency){

                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "SWIFT/BIC", "string", true, true, $regexRules['swift'])
                    ];
                }else{
                    return [
                        $accountTypeField,
                        self::make("account_number", "Account Number", "string", true, true, $regexRules['generic_account']),
                        self::make("code", "BRSTN", "string", true, true, $regexRules['brstn'])
                    ];
                }
            case 'USA':
                return [
                    $accountTypeField,
                    self::make("account_number", "Account Number", "string", false, true, $regexRules['generic_account'], "", [], [], false, "", ""),
                    self::make("iban", "IBAN", "string", false, true, $regexRules['iban'], "", [], [], false, "", ""),
                    self::make("code", "SWIFT/BIC", "string", false, true, $regexRules['swift'], "", [], [], false, "", ""),
                    self::make("routing_number", "Routing Number", "string", false, true, $regexRules['swift'], "", [], [], false, "", "code"),
                    ...$bankAddress
                ];
            default:
                return [
                    $accountTypeField,
                    self::make("account_number", "Account Number / IBAN", "string", true, true, $regexRules['generic_account']),
                    self::make("code", "SWIFT/BIC/Routing Number", "string", true, true, $regexRules['swift']),
                    ...$bankAddress
                ];
        }
    }

   public static function updateProfileFormFields($user, $externalType)
    {
        $countries = Helper::get_countries();

        $groups = [];

        switch ($externalType) {

            case EXTERNAL_TYPE_FVBANK:

                if ($user->user_type === USER_TYPE_INDIVIDUAL) {

                    $types = [
                        'proof_of_address' => [
                            'label' => 'Proof of Address',
                            'countries' => $countries,
                            'types' => Helper::get_lookups(LOOKUP_TYPE_PROOF_OF_ADDRESS) ?? [],
                        ],
                        'id_document' => [
                            'label' => 'ID Document',
                            'countries' => $countries,
                            'types' => Helper::get_lookups(LOOKUP_TYPE_ID_TYPE) ?? [],
                        ],
                        'source_of_funds' => [
                            'label' => 'Source of Funds',
                            'countries' => [],
                            'types' => Helper::get_lookups(LOOKUP_TYPE_SOURCE_OF_FUNDS) ?? [],
                        ],
                    ];

                } elseif ($user->user_type === USER_TYPE_BUSINESS) {

                    $types = [
                        'proof_of_address' => [
                            'label' => 'Proof of Address',
                            'countries' => $countries,
                            'types' => Helper::get_lookups(LOOKUP_TYPE_PROOF_OF_ADDRESS) ?? [],
                        ],
                        'proof_of_ownership' => [
                            'label' => 'Proof of Ownership',
                            'countries' => $countries,
                            'types' => [],
                        ],
                        'source_of_funds' => [
                            'label' => 'Source of Funds',
                            'countries' => [],
                            'types' => Helper::get_lookups(LOOKUP_TYPE_SOURCE_OF_FUNDS) ?? [],
                        ],
                    ];

                } else {
                    return [];
                }

                foreach ($types as $key => $config) {

                    $doc = UserDocument::where('user_id', $user->id)
                        ->where('document_name', $key)
                        ->first();

                    $business_verification_type = $user->userInformation->business_verification_type;

                    $needsBackFile = !$doc || empty($doc->document_back_file);
                    $needsExpiry   = !$doc || empty($doc->document_expiry_date);

                    if (!$needsBackFile && !$needsExpiry) {
                        continue;
                    }

                    $children = [];

                    if($user->user_type === USER_TYPE_INDIVIDUAL && empty($doc->document_file)){

                         $children[] = self::make('document_file', 'Document Back File', 'file', true, true, self::fileValidation());
                    }

                    if ($needsBackFile) {

                        $children[] = self::make('document_back_file', 'Document Back File', 'file', true, true, self::fileValidation());
                    }

                    if ($needsExpiry) {

                        $children[] = self::make('document_expiry_date', 'Document Expiry Date', 'date', true, true, ['min_date' => now()->format('Y-m-d')]);
                    }

                    $group = self::documentGroup($key, $config['label'], $config['countries'], $config['types']);


                    $group['children'] = $children;

                    $groups[] = $group;
                }

                if(empty($businessVerificationType) && $user->user_type === USER_TYPE_BUSINESS) {

                    $typesOfBusinessVerification = Helper::get_lookups(LOOKUP_BUSINESS_VERIFICATION_TYPES) ?? [];

                    $groups[] = self::make('business_verification_type', 'Business Verification Type', 'string', true, true, [], '', $typesOfBusinessVerification);
                }

                return $groups;

            default:

               return [];
        }
    }
}
