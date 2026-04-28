<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'caliza' => [
        'url' => env('CALIZA_BASE_URL'),
        'token' => env('CALIZA_APP_SECRET'),
        'timeout' => env('CALIZA_TIMEOUT', 60),
    ],

    'diginine' => [
        'url' => env('DIGININE_URL'),
        'is_sandbox' => env('DIGININE_IS_SANDBOX', 0),
    ],

    'herald_sumsub_service' => [
        'url' => env('HERALD_SUMSUB_URL'),
        'x_api_key' => env('HERALD_SUMSUB_X_API_KEY'),
        'salt_key' => env('HERALD_SUMSUB_SALT_KEY'),
        'merchant_id' => env('HERALD_SUMSUB_MERCHAND_ID'),
        'timeout' => env('HERALD_SUMSUB_TIMEOUT', 60),
    ],

    'surepass' => [
        'url' => env('SUREPASS_URL'),
        'auth_token' => env('SUREPASS_AUTH_TOKEN'),
        'timeout' => env('SUREPASS_TIMEOUT'),
        'is_sandbox' => env('SUREPASS_IS_SANDBOX', 0),
    ],

    'incode' => [
        'url' => env('INCODE_URL'),
        'api_key' => env('INCODE_API_KEY'),
        'configuration_id' => env('INCODE_CONFIGURATION_ID'),
        'client_id' => env('INCODE_CLIENT_ID', 60),
        'api_version' => env('INCODE_API_VERSION', 1.0),
        'timeout' => env('INCODE_TIMEOUT'),
        'is_sandbox' => env('INCODE_IS_SANDBOX', 0),
    ],

    'massive' => [
        'url' => env('MASSIVE_URL'),
        'api_key' => env('MASSIVE_API_KEY'),
        'is_sandbox' => env('MASSIVE_IS_SANDBOX', 0),
    ],

    'fv_bank_micro' => [
        'url' => env('FV_BANK_MICRO_URL'),
        'client_secret' => env('FV_BANK_MICRO_CLIENT_SECRET'),
        'is_enabled' => env('FV_BANK_ENABLED', false),
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'chat_id'  => env('TELEGRAM_CHAT_ID'),
        'callback_chat_id'  => env('TELEGRAM_CALLBACK_CHAT_ID'),
        'enabled'  => env('TELEGRAM_ENABLED', true),
    ],

    'compliance' => [
        'url' => env('COMPLIANCE_API_URL'),
        'email' =>  env('COMPLIANCE_EMAIL'),
        'password' => env('COMPLIANCE_PASSWORD'),
        'timeout' => env('COMPLIANCE_TIMEOUT', 60),
        'api_key' => env('COMPLIANCE_API_KEY'),
        'transactions_limit' => env('COMPLIANCE_TRANSACTIONS_LIMIT', 100),
        'sleep' => env('COMPLIANCE_SLEEP', 2),

    ],

    'compliance_externalClient' => [
        'id' => env('COMPLIANCE_externalClientId'),
        'name' => env('COMPLIANCE_externalClientName'),
        'code' => env('COMPLIANCE_externalClientCode'),
    ],

    'viyona_pay' => [
        'url' => env('VIYONAPAY_BASE_URL'),
        'timeout' => env('VIYONAPAY_TIMEOUT', 60),
        'client_id' => env('VIYONAPAY_CLIENT_ID'),
        'client_secret' => env('VIYONAPAY_CLIENT_SECRET'),
        'client_api_key' => env('VIYONAPAY_API_KEY'),
        'client_api_type' => env('VIYONAPAY_API_TYPE', 'PAYOUT'),
        'is_sandbox' => env('VIYONAPAY_IS_SANDBOX', false),
        'client_private_key_path' => public_path('keys/vp_v2_one_private.pem'),
        'server_public_key_path' => public_path('keys/public_server_key.pem'),
        'base_url' => env('VIYONAPAY_URL','https://core.viyonapay.com')
    ],

    'callbacks' => [
        'diginine' => env('DIGININE_CALLBACK_URL'),
        'caliza' => env('CALIZA_CALLBACK_URL'),
    ],


    'invoicemate' => [
        'url' => env('INVOICEMATE_URL'),
        'email' => env('INVOICEMATE_EMAIL'),
        'password' => env('INVOICEMATE_PASSWORD'),
        'api_key' => env('INVOICEMATE_API_KEY'),
        'is_enabled' => env('INVOICEMATE_IS_ENABLED', false),
    ],
    
    'processingunit' => [
        'url' => env('PROCESSING_UNIT_URL'),
        'apiKey' => env('PROCESSING_UNIT_API_KEY'),
        'apiSecret' => env('PROCESSING_UNIT_API_SECRET'),
    ],

    'remittance' => [
        'base_url' => env('REMITTANCE_BASE_URL'),
        'api_key' => env('REMITTANCE_API_KEY'),
        'transactions_limit' => env('REMITTANCE_TRANSACTIONS_LIMIT', 100),
        'sleep' => env('REMITTANCE_SLEEP', 2),
    ],
];
