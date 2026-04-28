<?php

use App\Models\Settings;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Session;
use Akaunting\Setting\Facade as Setting;
use App\Helpers\Helper;
use App\Models\MobileCountryCode;
use App\Models\State;
use App\Models\SupportedCountry;
use App\Models\VirtualAccount;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function api_success($key, $other_key = "", $lang_path = "messages.")
{

    $locale = request()->language ?? config('app.locale');

    if (!Session::has('locale')) {

        Session::put('locale', $locale);
    }

    return Lang::choice('api-success.' . $key, 0, ['other_key' => $other_key], $locale);
}
function api_error($key, $other_key = "", $lang_path = "messages.")
{

    $locale = request()->language ?? config('app.locale');

    if (!Session::has('locale')) {

        Session::put('locale', $locale);
    }

    return Lang::choice('api-error.' . $key, 0, array('other_key' => $other_key), $locale);
}

function tr($key, array $replace = [], $lang_path = 'messages.')
{
    if (!Session::has('locale')) {
        Session::put('locale', config('app.locale'));
    }

    $locale = Session::get('locale');

    $translation = Lang::get($lang_path . $key, $replace, $locale);

    if (is_array($translation)) {
        $translation = json_encode($translation);
    }

    return $translation;
}
function generateEmailCode()
{

    return mt_rand(100000, 999999);
}

function generateEmailCodeExpiry()
{

    return time() + (Setting::get('email_code_expiry_minutes', 10) * 60);
}

function user_email_status_code($email_verified_at)
{

    return $email_verified_at ? EMAIL_VERIFIED : EMAIL_NOT_VERIFIED;
}

function removeFromLogger(): array
{
    return [
        '_token',
        'password',
        'password_confirmation',
        'current_password',
        'device_id',
        'document_file',
    ];
}

function generate_unique_id($length = 10): string
{

    $unique_id = '';

    while ($length > Str::length($unique_id)) {
        $unique_id .= sha1(time() . rand());
    }

    return Str::substr($unique_id, 1, $length);
}
function common_date($date, $timezone, $format = "d M Y h:i A")
{

    if (!$date) {

        return "";
    }

    if ($timezone) {

        $date = convertTimeToUSERzone($date, $timezone, $format);
    }

    return date($format, strtotime($date));
}
function convertTimeToUSERzone($str, $userTimezone, $format = 'Y-m-d H:i:s')
{

    if (empty($str)) {
        return '';
    }

    try {

        $new_str = new DateTime($str, new DateTimeZone('UTC'));

        $new_str->setTimeZone(new DateTimeZone($userTimezone));
    } catch (\Exception $e) {

        info($e->getMessage());
    }

    return $new_str->format($format);
}

function flattenArray(array $array, string $prefix = ''): array
{
    $result = [];

    foreach ($array as $key => $value) {

        $fullKey = $prefix ? "{$prefix}[{$key}]" : $key;

        if (is_array($value)) {

            $result += flattenArray($value, $fullKey);

        } else {

            $result[$fullKey] = $value;
        }
    }
    return $result;
}
function format_caliza_onboarding_status($onboarding_status)
{


    $statusMap = [
        "CREATED" => ONBOARDING_STATUS_CREATED,
        "PENDING" => ONBOARDING_STATUS_INITIATED,
        "MANUAL_REVIEW" =>  ONBOARDING_STATUS_INITIATED,
        "KYC_IN_PROGRESS"   =>  ONBOARDING_STATUS_INITIATED,
        "DISABLED" =>  ONBOARDING_STATUS_INITIATED,
        "FAILED" =>  ONBOARDING_STATUS_FAILED,
    ];

    return $statusMap[$onboarding_status] ?: ONBOARDING_STATUS_FAILED;
}

function calulate_fx_rate($from, $to)
{

    $fx_rate = 1;

    $fx_rate = $from / $to;

    return $fx_rate;
}

function format_fx_rate($quote)
{

    return "1 " . $quote->source->currency . " = " . $quote->fx_rate . " " . $quote->receiving_currency;
}

function available_banks($user)
{

    $banks = [
        [
            "key" => EXTERNAL_TYPE_CALIZA,
            "value" => CALIZA_BANK_NAME,
            "currency" => "USD",
        ],
    ];

    if(config('services.fv_bank_micro.is_enabled')) {

        $banks[] = [
            "key" => EXTERNAL_TYPE_FVBANK,
            "value" => FV_BANK_NAME,
            "currency" => "USD",
        ];
    }

    return $banks;
}

function caliza_transaction_status_map($status)
{
    return [
        "CREATED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "PAYMENT_SENT" => BENEFICIARY_TRANSACTION_COMPLETED,
        "MANUAL_REVIEW" =>  BENEFICIARY_TRANSACTION_PROCESSING,
        "KYC_IN_PROGRESS"   =>  BENEFICIARY_TRANSACTION_PROCESSING,
        "DISABLED" =>  BENEFICIARY_TRANSACTION_FAILED,
        "FAILED" =>  BENEFICIARY_TRANSACTION_FAILED,
    ][$status] ?? BENEFICIARY_TRANSACTION_PROCESSING;
}


function diginine_transaction_status_map($status)
{

    $beneficiary_transaction_status_formatted = [
        "QUOTE_ACCEPTED" => BENEFICIARY_TRANSACTION_INITIATED,
        "ORDER_VERIFIED" => BENEFICIARY_TRANSACTION_INITIATED,
        "ORDER_ACCEPTED" => BENEFICIARY_TRANSACTION_INITIATED,
        "PAYMENT_PENDING" => BENEFICIARY_TRANSACTION_PROCESSING,
        "BALANCE_IN_SUFFICIENT" => BENEFICIARY_TRANSACTION_PROCESSING,
        "PAYMENT_AWAIT_CLEARANCE" => BENEFICIARY_TRANSACTION_PROCESSING,
        "PAYMENT_SETTLED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "PAYMENT_REJECTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "PAYMENT_APPROVED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AML_PENDING" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AML_COMPLETED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AML_MARKED_FOR_EDD" => BENEFICIARY_TRANSACTION_PROCESSING,
        "RFI_REQUESTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AML_FAILED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AWAITING_CLEARANCE" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CLEARANCE_ACCEPTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "TXN_VERIFIED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "TXN_PREPARED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "TXN_RELEASED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "TXN_TRANSMITTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CREDITED" => BENEFICIARY_TRANSACTION_COMPLETED,
        "AVAILABLE_PAID" => BENEFICIARY_TRANSACTION_PROCESSING,
        "RECONCILED" => BENEFICIARY_TRANSACTION_PROCESSING,

        "CANCELLATION_INITIATED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_REQUEST_CREATED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_REQUEST_CONFIRMED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_REQUEST_REJECTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_ACCEPTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_COMPLETED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "CANCELLATION_DENIED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "AML_REJECTED" => BENEFICIARY_TRANSACTION_PROCESSING,
        "ORDER_REJECTED" => BENEFICIARY_TRANSACTION_PROCESSING,
    ];

    return $beneficiary_transaction_status_formatted[$status] ?: BENEFICIARY_TRANSACTION_PROCESSING;
}

function get_alpha2_code($alpha3_code)
{

    return MobileCountryCode::where('alpha_3_code', $alpha3_code)->value('alpha_2_code') ?? $alpha3_code;
}
function get_alpha3_code($alpha2_code)
{

    return MobileCountryCode::where('alpha_2_code', $alpha2_code)->value('alpha_3_code') ?? $alpha2_code;
}

function get_country_name($code){

    return MobileCountryCode::where('alpha_3_code', $code)->orWhere('alpha_2_code', $code)->value('country_name') ?? $code;
}
function getExternalType($country, $currency, $user = null)
{
    $service_providers = [];

    if ($user) {

        $service_providers = $user->service_providers ?? [];

        $user_services = $user->userServices()->where('is_active', 1)->get();

        foreach ($user_services as $service) {

            $service_providers[] = $service->service_type;
        }
    }

    $country = SupportedCountry::supported()->where('country_code', $country)->where('currency', $currency)->first();

    if ($country) {

        if(in_array($country->external_type, $service_providers)){

            return $country->external_type;
        }
    }

    return null;
}

function getExternalTypes($country, $currency, $user = null): array
{
    $serviceProviders = [];


    if ($user) {

        if($user->merchant && $user->merchant->type == MERCHANT_TYPE_PAYOUT) {
            
            $virtualAccounts = VirtualAccount::forUser($user)->where('currency', $currency)->get();

            foreach ($virtualAccounts as $virtualAccount) {
                $serviceProviders[] = $virtualAccount->external_type;
            }
        }else{

            $serviceProviders = $user->userServices()
            ->where('is_active', 1)
            ->pluck('service_type')
            ->toArray();
        }
    }

    return SupportedCountry::supported()->where('country_code', $country)
        ->where('currency', $currency)
        ->whereIn('external_type', $serviceProviders)
        ->pluck('external_type')
        ->unique()
        ->values()
        ->toArray();
}

function disposable_email_list()
{
    return [
        'mailinator.com',
        'tempmail.com',
        '10minutemail.com',
        'guerrillamail.com',
        'maildrop.cc',
        'dropmail.me',
        'harakirimail.com',
        'trashmail.com',
        'temp-mail.org',
        'getnada.com',
        'yopmail.com',
        'mintemail.com',
        'fakeinbox.com',
        'spamgourmet.com',
        'sharklasers.com',
        'grr.la',
        'pokemail.net',
        'sharklasers.com',
        '10minutemail.net',
        '10minutemail.co.uk',
        '10minutemail.info',
        '10m.email',
        'mohmal.com',
        'mohmal.in',
        'mohmal.tech',
        'yopmail.fr',
        'yopmail.net',
        'cool.fr.nf',
        'jetable.fr.nf',
        'nospam.ze.tc',
        'hidemyass.com',
        'hmamail.com',
        'temp-mail.io',
        'tempmail.net',
        'tempmailer.com',
        'tmpmail.net',
        'guerrillamail.de',
        'guerrillamail.info',
        'guerrillamail.net',
        'guerrillamail.org',
        'getairmail.com',
        'getnada.net',
        'abyssmail.com',
        'mailcatch.com',
        'mailnesia.com',
        'maildrop.cc',
        'trashmail.net',
        'trashmail.com',
        'trashmail.de',
        'throwawaymail.com',
        'throwawaymail.io',
        'throwawaymail.net',
        'trash-mail.com',
        'spam4.me',
        'tempinbox.com',
        'dispostable.com',
        'discard.email',
        'mailpoof.com',
        'tempail.com',
        'emailondeck.com',
        'mailtothis.com',
        'fakemailgenerator.com',
        'mytemp.email',
        'fakemail.net',
        'moakt.com',
        'tmail.com',
        'tmail.io',
        'mailtemp.info',
        'tempr.email',
        'tempmail.de',
        'trashmail.ws',
        'mailmetrash.com',
        'tempinbox.xyz',
        'tempmail.plus',
        'etramaya.com',
        'etramay.com',
    ];
}

function passwordRegex() {

    return '/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-])[A-Za-z\d@$!%*?&._\-]{8,}$/';
}

function formatted_amount($amount = 0.00, $currency_code = "")
{

    $currency_code = $currency_code ?: Setting::get('currency_code', 'USD');

    $currency = Setting::get('currency', '$');

    $amount = number_format((float)$amount, 2, '.', '');

    $formatted_amount = "$currency $amount" ?: "0.00";

    return $formatted_amount;
}

function format_transaction_status($status){

    $statusMap = [
        BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL => 'Waiting For Approval',
        BENEFICIARY_TRANSACTION_APPROVED => 'Pending',
        BENEFICIARY_TRANSACTION_INITIATED => 'Initiated',
        BENEFICIARY_TRANSACTION_PROCESSING => 'Processing',
        BENEFICIARY_TRANSACTION_COMPLETED => 'Completed',
        BENEFICIARY_TRANSACTION_FAILED => 'Failed',
        BENEFICIARY_TRANSACTION_EXPIRED => 'Expired',
        BENEFICIARY_TRANSACTION_REJECTED => 'Rejected',
        BENEFICIARY_TRANSACTION_CANCELLED => 'Cancelled',
    ];

    return $statusMap[$status] ?? 'Pending';
}

function routefreestring($string)
{

    $string = preg_replace('/[^A-Za-z0-9\-]/', '', str_replace(' ', '-', $string));

    $search = [' ', '&', '%', "?", '=', '{', '}', '$'];

    $replace = ['-', '-', '-', '-', '-', '-', '-', '-'];

    $string = str_replace($search, $replace, $string);

    return $string;
}

function format_transaction_type($transaction)
{

    if($transaction->transaction instanceof WalletTransaction) {

        $type = $transaction->transaction->type;
    }else{

        $typeMap = [
            'App\Models\BeneficiaryTransaction' => TRANSACTION_TYPE_DEBIT,
            'App\Models\DepositTransaction' => TRANSACTION_TYPE_CREDIT,
        ];

        $type = $typeMap[$transaction->transaction->getMorphClass()] ?? TRANSACTION_TYPE_DEBIT;
    }

    return $type;
}

function generateRsaKeyPair(): array
{
    $keyResource = openssl_pkey_new([
        "private_key_bits" => 2048,
        "private_key_type" => OPENSSL_KEYTYPE_RSA,
    ]);

    openssl_pkey_export($keyResource, $privateKey);
    $publicKey = openssl_pkey_get_details($keyResource)['key'];

    return [$privateKey, $publicKey];
}

function format_incode_status($status){

    $statusMap=[
        "UNKNOWN" => IDENTITY_VERIFICATION_INITIATED,
        "OK" => IDENTITY_VERIFICATION_COMPLETED
    ];

    return $statusMap[$status] ?? IDENTITY_VERIFICATION_INITIATED;
}

function filterEmptyValues(array $array): array
{
    $result = [];

    foreach ($array as $key => $value) {

        if (is_array($value)) {

            $filtered = filterEmptyValues($value);

            if (!empty($filtered)) {

                $result[$key] = $filtered;
            }
        } elseif ($value !== '' && $value !== null) {

            $result[$key] = $value;
        }
    }

    return $result;
}

function get_state_code($name){

    $state_code = State::where('name', $name)->first();

    return $state_code ? $state_code->state_code : '';
}

function get_state_name($code, $country_code = null)
{
    $query = State::where('state_code', $code);

    if ($country_code) {

        $query->where(function ($q) use ($country_code) {
            $q->where('country_code', $country_code)
              ->orWhere('country_alpha3', $country_code);
        });
    }

    $state = $query->first();

    return $state ? $state->name : $code;
}

function beneficiary_transaction_status_formatted($status)
{
    $badge = [
        BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL => tr('waiting_for_maker_approval'),
        BENEFICIARY_TRANSACTION_APPROVED => tr('approved'),
        BENEFICIARY_TRANSACTION_INITIATED => tr('initiated'),
        BENEFICIARY_TRANSACTION_PROCESSING => tr('processing'),
        BENEFICIARY_TRANSACTION_COMPLETED => tr('completed'),
        BENEFICIARY_TRANSACTION_FAILED => tr('failed'),
        BENEFICIARY_TRANSACTION_EXPIRED => tr('expired'),
        BENEFICIARY_TRANSACTION_REJECTED => tr('rejected'),
        BENEFICIARY_TRANSACTION_CANCELLED => tr('cancelled'),
    ];

    return isset($badge[$status]) ? $badge[$status] : tr('na');
}

function deposit_transaction_status_formatted($status)
{
    $badge = [
        DEPOSIT_TRANSACTION_PENDING => tr('pending'),
        DEPOSIT_TRANSACTION_COMPLETED => tr('completed'),
        DEPOSIT_TRANSACTION_FAILED => tr('failed'),
        DEPOSIT_TRANSACTION_REJECTED => tr('rejected'),
    ];

    return isset($badge[$status]) ? $badge[$status] : tr('na');
}

function normalizeState($state)
{
    if (!$state) {
        return '';
    }

    $state = trim($state);

    if (preg_match('/^[A-Za-z]{2}$/', $state)) {
        return strtoupper($state);
    }

    $state_detail = State::where('state_code', 'like', '%' . $state . '%')->first();

    return $state_detail ? $state_detail->country_code : $state;
}

function gender_formatted($gender)
{
    return [
        GENDER_MALE => tr('male'),
        GENDER_FEMALE => tr('female'),
        GENDER_OTHER => tr('other'),
    ][$gender] ?? tr('na');
}
function fv_bank_status_formatted($status)
{
    $badge = [
        FV_BANK_ONBOARDING_INITIATED => tr('active'),
        FV_BANK_ONBOARDING_COMPLETED => tr('inactive'),
    ];

    return isset($badge[$status]) ? $badge[$status] : tr('na');
}

function format_validation_status($status)
{
    return [
        BENEFICIARY_ACCOUNT_VALIDATION_STATUS_FAILED => tr('failed'),
        BENEFICIARY_ACCOUNT_VALIDATION_STATUS_SUCCESS => tr('success'),
        BENEFICIARY_ACCOUNT_VALIDATION_STATUS_PENDING => tr('pending'),
    ][$status] ?? tr('na');
}

function format_payment_type($payment_type)
{
    return [
        PAYMENT_RAIL_WIRE => 'BUS_USD_Account.Domestic_Wire_BUS',
        PAYMENT_RAIL_SWIFT => 'BUS_USD_Account.BUS_International_Transfer',
        PAYMENT_RAIL_ACH => 'BUS_USD_Account.Business_ACH',
    ][$payment_type] ?? 'BUS_USD_Account.Business_ACH';
}

function upload_files($file)
{
    $fileName = null;
    
    if ($file instanceof \Illuminate\Http\UploadedFile) {

        $fileName = Helper::uploadToS3($file, USER_SUPPORTING_DOCUMENT_FILE_PATH);

        throw_if(!$fileName, new Exception(api_error(109), 109));
    } else if (is_string($file) && Helper::isBase64File($file)) {

        $fileName = Helper::uploadBase64ToS3($file, USER_SUPPORTING_DOCUMENT_FILE_PATH);

        throw_if(!$fileName, new Exception(api_error(109), 109));
    }

    return $fileName;
}

function filter_non_mandatory_fields(array $fields, array $non_mandatory_fields)
{
    if (empty($non_mandatory_fields)) {
        return $fields;
    }

    return collect($fields)
        ->map(function ($field) use ($non_mandatory_fields) {

            if (
                ($field['is_mandatory'] ?? false) === true &&
                in_array($field['field_key'], $non_mandatory_fields, true)
            ) {
                $field['is_mandatory'] = false;

                if (isset($field['children']) && is_array($field['children'])) {
                    $field['children'] = force_non_mandatory($field['children']);
                }
            }

            return $field;
        })
        ->values()
        ->all();
}


function force_non_mandatory(array $children)
{
    return collect($children)
        ->map(function ($child) {

            $child['is_mandatory'] = false;

            if (isset($child['children']) && is_array($child['children'])) {
                $child['children'] = force_non_mandatory($child['children']);
            }

            return $child;
        })
        ->values()
        ->all();
}

function convertUSDratetoAED($response){
    
     $aedRate = $response['fx_rate'] / env('USD_TO_AED');

     Log::info('AED Rate for ' . $response['to_currency'] . ': ' . $aedRate);

     return $aedRate;
}

function requiresTfa(): bool
{
    if (auth()->guard('team')->check()) {

        return false;
    }
    $user = Helper::getAuthUser();

    if (!$user || !$user->is_tfa_enabled) {
        return false;
    }

    $token = $user->currentAccessToken();


    if (!$token || is_null($token->expires_at)) {

        return true;
    }

    return false;
}

function deposit_source_of_fund()
{
    $sourceOfFunds = [
        "employment_income" => "Employment Income",
        "personal_savings" => "Personal Savings",
        "business_revenue" => "Business Revenue",
        "sales_commission" => "Sales Commission",
        "borrowed_funds" => "Borrowed Funds",
        "investment_returns" => "Investment Returns",
        "legal_settlement" => "Legal Settlement Proceeds",
        "prize_earnings" => "Prize or Lottery Earnings",
        "goods_sales" => "Merchandise Sales",
        "property_sale" => "Property Disposal",
        "dividend_income" => "Dividend Earnings",
        "pension_income" => "Retirement Pension",
        "freelance_income" => "Freelance Earnings",
        "gift_received" => "Family Support / Gift",
        "other_income" => "Other Income Source",
    ];

    return $sourceOfFunds;
}

function deposit_purpose()
{
    $purposeOfPayment = [
        "incentive_payment" => "Incentive Payment",
        "internal_transfer" => "Internal Fund Transfer",
        "card_settlement" => "Card Settlement Processing",
        "credit_card_bill" => "Credit Card Bill Payment",
        "trade_settlement" => "Commercial Trade Settlement",
        "consulting_services" => "Technology or Consulting Services",
        "license_fee" => "Intellectual Property / License Fee",
        "trade_refund" => "Trade Refund or Adjustment",
        "tax_payment" => "Government Tax Payment",
        "invoice_payment" => "Invoice Settlement",
        "loan_repayment" => "Debt Repayment",
        "payroll_payment" => "Payroll Disbursement",
        "supplier_payment" => "Vendor or Supplier Payment",
        "investment_funding" => "Investment Funding",
        "personal_transfer" => "Personal Fund Transfer",
        "product_purchase" => "Purchase of Products",
        "service_payment" => "Professional Service Charges",
        "other_payment" => "Miscellaneous Payment",
    ];

    return $purposeOfPayment;
}

function generateOrderID()
{
    $prefix = 'TXN';

    $timestamp = substr(time(), -8);

    $random = strtoupper(Str::random(4));

    return $prefix . $timestamp . $random;
}

function get_s3_file_base64_and_mime(string $s3Url): ?array
{
    try {
        $path = ltrim(parse_url($s3Url, PHP_URL_PATH), '/');

        if (!Storage::disk('s3')->exists($path)) {
            return null;
        }

        $fileContents = Storage::disk('s3')->get($path);
        $mimeType     = Storage::disk('s3')->mimeType($path);

        return [
            'mime'   => $mimeType,
            'base64' => base64_encode($fileContents),
            'data_uri' => "data:{$mimeType};base64," . base64_encode($fileContents),
        ];
    } catch (\Throwable $e) {
        report($e);
        return null;
    }
}


function getMappedValue(array $map, string $value, string $type, string $default = ''): string
{
    $value = strtoupper(trim($value));

    if (isset($map[$value])) {
        return $map[$value];
    }

    Log::warning("Compliance mapping missing", [
        'type' => $type,
        'value' => $value
    ]);

    return $default ?: 'OTHERS';
}

function mapAccountType(?string $value): string
{
    $value = strtoupper(trim((string) $value));

    $map = [
        'CHECKING' => 'CHECKING',
        'SAVINGS' => 'SAVINGS',
        'GENERALLEDGER' => 'GENERAL_LEDGER',
        'LOAN' => 'LOAN',
    ];

    if (isset($map[$value])) {

        return $map[$value];
    }

    Log::warning("Compliance mapping missing", [
        'type' => 'Account Type',
        'value' => $value
    ]);

    return 'OTHER';
}

function mapIdType(?string $value): string
{
    $value = strtoupper(trim((string) $value));

    $map = [
        'SPASS' => 'SPASS',
        'EPASS' => 'EPASS',
        'NRIC' => 'NRIC',
        'CPR' => 'CPR',
        'ACRA' => 'ACRA',
        'RESIDENT' => 'RESIDENT',
        'OTHERS' => 'OTHERS',
        'SEAMEN' => 'SEAMEN',
        'DIPLOMATS' => 'DIPLOMATS',
        'TRANSIT' => 'TRANSIT',

        'PASSPORT' => 'PASSPORT',
        'ID CARD' => 'NATIONAL_ID',
        'DRIVING LICENSE' => 'DRIVERS_LICENSE',
        'INTERNATIONAL LICENSE' => 'INTERNATIONAL_LICENSE',
        'CIVIL ID' => 'CIVIL_ID',
        'RESIDENT CARD' => 'RESIDENT_CARD',
        'DIPLOMATIC ID' => 'DIPLOMATIC_ID',
        'ELECTORAL PHOTO IDENTITY CARD(EPIC)' => 'ELECTORAL_PHOTO_IDENTITY_CARD',
        'PAN CARD' => 'PAN_CARD',
        'SSN/SSS - PHILIPPINES' => 'SSN_SSS_PHILIPPINES',
        'WORKPERMIT' => 'WORKPERMIT',
        'EMPLOYMENT PASS' => 'EMPLOYMENT_PASS',
        'DEPENDENTS PASS' => 'DEPENDENTS_PASS',
        'LONG TERM VISIT PASS' => 'LONG_TERM_VISIT_PASS',
        'WORK HOLIDAY PASS' => 'WORK_HOLIDAY_PASS',
        'ENTREPRENEURS PASS' => 'ENTREPRENEURS_PASS',
        'AADHAAR CARD' => 'AADHAAR_CARD',
        'NREGA CARD' => 'NREGA_CARD',
        'MALAYSIA ID CARD (IKAD)' => 'MALAYSIA_ID_CARD_IKAD',
        'MALAYSIA ID CARD (MYKAD)' => 'MALAYSIA_ID_CARD_MYKAD',
        'EMIRATES ID' => 'EMIRATES_ID',
        'LABOUR CARD' => 'LABOUR_CARD',
        'HONG KONG ID' => 'HONG_KONG_ID',
        'GCC CARD' => 'GCC_CARD',
        'GCC NATIONALITY' => 'GCC_NATIONALITY',
        'NATIONAL ID CARD ( IRELAND )' => 'NATIONAL_ID_CARD_IRELAND',
        'NIC NO' => 'NIC_NO',
        'BUSINESS REGISTRATION NO(BR)' => 'BUSINESS_REGISTRATION_NO',
        'COMMERCIAL REGISTRATION' => 'COMMERCIAL_REGISTRATION',
        'COMPANY REGISTRATION NUMBER(CRN)' => 'COMPANY_REGISTRATION_NUMBER',
        'LOCAL TRADE LICENSE' => 'LOCAL_TRADE_LICENSE',
        'FREE ZONE' => 'FREE_ZONE',
        'CENTRAL BANK LICENCE' => 'CENTRAL_BANK_LICENCE',
        'MONEY SERVICE OPERATORS LICENSE(MSO)' => 'MONEY_SERVICE_OPERATORS_LICENSE',
        'TOURIST/VISIT VISA' => 'TOURIST_VISIT_VISA',
        'SEAMEN PERMIT' => 'SEAMEN_PERMIT',
        'CRUISE ID/SHIP BOARDING CARD' => 'CRUISE_ID_SHIP_BOARDING_CARD',
        'AIRLINE STAFF CARD' => 'AIRLINE_STAFF_CARD',
        'UNHCR CARD' => 'UNHCR_CARD',
        'NON-RESIDENT' => 'NON_RESIDENT',
        'ID OF PR' => 'ID_OF_PR',
        'SGR NATIONAL ID' => 'SGR_NATIONAL_ID',
        'DIGITAL SIGNATURE' => 'DIGITAL_SIGNATURE',
        'ID CARD' => 'ID_CARD',
        'BENEFICIARY ID' => 'BENEFICIARY_ID',
    ];

    return getMappedValue($map, $value, 'ID_TYPE');
}



function mapSourceOfFunds(?string $value): string
{
    $value = strtoupper(trim((string) $value));

    $map = [
        'SALARY' => 'SALARY',
        'BUSINESS INCOME' => 'BUSINESS_INCOME',
        'PENSION RETIREMENT' => 'PENSION_RETIREMENT',
        'SAVINGS' => 'SAVINGS',
        'INHERITANCE' => 'INHERITANCE',
        'GIFTS' => 'GIFTS',
        'SOMEONE ELSE FUNDS' => 'SOMEONE_ELSE_FUNDS',
        'INVESTMENT PROCEEDS' => 'INVESTMENT_PROCEEDS',
        'INVESTMENT LOANS' => 'INVESTMENT_LOANS',
        'SALE OF ASSETS (REAL ESTATE)' => 'SALE_OF_ASSETS_REAL_ESTATE',
        'ESOPS' => 'ESOPS',
        'GOVERNMENT BENEFITS' => 'GOVERNMENT_BENEFITS',
        'GAMBLING PROCEEDS' => 'GAMBLING_PROCEEDS',
    ];

    if (isset($map[$value])) {

        return $map[$value];
    }

    Log::warning("Compliance mapping missing", [
        'type' => 'SOURCE_OF_FUNDS',
        'value' => $value
    ]);

    return 'OTHER';
}


function mapPurposeOfPayment(?string $value): string
{
    $value = strtoupper(trim((string) $value));

    $map = [
        'FAMILY MAINTENANCE' => 'FAMILY_SUPPORT',
        'CHARITABLE DONATIONS' => 'CHARITY',
        'MEDICAL EXPENSES' => 'MEDICAL',
        'BUSINESS TRANSACTIONS' => 'BUSINESS_PAYMENT',
        'PROTECT WEALTH' => 'PROTECT_WEALTH',
        'INVESTMENT PURPOSES' => 'INVESTMENT',
        'REPAYMENT OF LOAN' => 'LOAN_REPAYMENT',
        'SAVINGS' => 'SAVINGS',
        'PAYMENTS TO FRIENDS OR FAMILY ABROAD' => 'PAYMENTS_TO_FRIENDS_OR_FAMILY_ABROAD',
        'PERSONAL OR LIVING EXPENSES' => 'PERSONAL_OR_LIVING_EXPENSES',
        'OTHERS' => 'OTHER',

        'RENT' => 'RENT',
        'TRAVEL' => 'TRAVEL',
        'GIFT' => 'GIFT',
        'SALARY' => 'SALARY',
    ];

    if (isset($map[$value])) {
        return $map[$value];
    }

    Log::warning("Compliance mapping missing", [
        'type' => 'PURPOSE_OF_PAYMENT',
        'value' => $value
    ]);

    return 'OTHER';
}

function ProcessingUnit_status_map($status)
{
    $map = [
        "PENDING" => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED,
        "INPROGRESS" => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        "SUCCESS" => BENEFICIARY_TRANSACTION_COMPLETED,
        "PARTIALLY_FAILED" => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        "FAILED" => BENEFICIARY_TRANSACTION_FAILED,
        "REJECTED" => BENEFICIARY_TRANSACTION_FAILED
    ];

    if (!isset($map[$status])) {

        Log::warning("New Processing Unit Status received", [
            'type' => 'PROCESSING_UNIT_STATUS',
            'value' => $status
        ]);

        return [
            'mapped' => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING,
            'is_new' => true,
            'original' => $status
        ];
    }

    return [
        'mapped' => $map[$status],
        'is_new' => false,
        'original' => $status
    ];
}

function ProcessingUnit_Depositstatus_map($status){

    $map = [
        "PENDING" => DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED,
        "INPROGRESS" => DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
        "SUCCESS" => DEPOSIT_TRANSACTION_COMPLETED,
        "FAILED" => DEPOSIT_TRANSACTION_FAILED,
    ];

    if (!isset($map[$status])) {

        Log::warning("New Processing Unit Status received", [
            'type' => 'PROCESSING_UNIT_STATUS',
            'value' => $status
        ]);

        return [
            'mapped' => DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING,
            'is_new' => true,
            'original' => $status
        ];
    }

    return [
        'mapped' => $map[$status],
        'is_new' => false,
        'original' => $status
    ];
}

function MapProcessingUnitService($service){

     $map = [
        EXTERNAL_TYPE_DIGININE => "ED",
        EXTERNAL_TYPE_CALIZA => "ECZ",
        EXTERNAL_TYPE_VIYONA_PAY => "EVP",
        "em" => "MANUAL"
     ];

     return $map[$service] ?? $service;
}

function MapProcessingUnitStatus($status)
{
    $map = [
        BENEFICIARY_TRANSACTION_COMPLETED => 2,
        BENEFICIARY_TRANSACTION_CANCELLED => 5,
        BENEFICIARY_TRANSACTION_FAILED => 5,
        BENEFICIARY_TRANSACTION_EXPIRED => 5,
        BENEFICIARY_TRANSACTION_REJECTED => 4,
    ];

    return $map[$status] ?? 5;
}

function ProcessingUnitServiceMap($service){

     $map = [
        "ED" => EXTERNAL_TYPE_DIGININE,
        "ECZ" => EXTERNAL_TYPE_CALIZA,
        "EVP" => EXTERNAL_TYPE_VIYONA_PAY,
        "MANUAL" => "em"
     ];

     return $map[$service] ?? $service;
}

function deposit_currency_types(){

    return [
        CURRENCY_USDC,
        CURRENCY_USDT,
        CURRENCY_USD,
    ];
}
function format_processing_unit_fx_rate($fxRate)
{
    if (is_string($fxRate) && Str::contains($fxRate, '=')) {
        $fxRate = trim(explode('=', $fxRate)[1]);
        $fxRate = preg_replace('/[^\d.]/', '', $fxRate);
    }

    return $fxRate;
}