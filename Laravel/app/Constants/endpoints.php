<?php

/*
|--------------------------------------------------------------------------
| Third Party Endpoints
|--------------------------------------------------------------------------
*/


// Caliza Endpoints

define('CALIZA_ONBOARDING_ENDPOINT','/onboarding');

define('CALIZA_GET_USER_DETAILS_ENDPOINT','/onboarding');

define('CALIZA_VIRTUAL_ACCOUNT_ENDPOINT','/create_virtual_account');

define('CALIZA_GET_VIRTUAL_ACCOUNTS_ENDPOINT','/get_virtual_accounts');

define('CALIZA_GET_USER_BALANCE_ENDPOINT','/get_balance');

define('CALIZA_CREATE_BENEFICIARY_ENDPOINT','/create_beneficiary');

define('CALIZA_SIMULATE_PAYOUT_ENDPOINT','/simulate_payout');

define('CALIZA_EXECUTE_PAYOUT_ENDPOINT','/execute_payout');

define('CALIZA_PAYOUT_STATUS_ENDPOINT','/payout_status');

// Herald Sumsub Endpoints

define('HERALD_SUMSUB_BASE_ENDPOINT', '/api/scr/user_kyc_verification');

define('HERALD_SUMSUB_ACCESS_TOKEN_ENDPOINT', '/access_token');

define('HERALD_SUMSUB_STATUS_ENDPOINT', '/status');


// DIGININE Endpoints

define('DIGININE_SERVICE_CORRIDOR_ENDPOINT', '/api/digi9/service-corridor');

define('DIGININE_QUOTE_ENDPOINT', '/api/digi9/transactions/quote');

define('DIGININE_CREATE_TRANSACTION_ENDPOINT', '/api/digi9/transactions/create_transaction');

define('DIGININE_GET_LOOKUPS_ENDPOINT', '/api/digi9/codes');

define('DIGININE_GET_BANKS_ENDPOINT', '/api/digi9/banks');

define('DIGININE_CONFIRM_TRANSACTION_ENDPOINT', '/api/digi9/transactions/confirm_transaction');

define('DIGININE_GET_TRANSACTION_STATUS_ENDPOINT', '/api/digi9/transactions/check_status');

define('DIGININE_GET_RATES_ENDPOINT', '/api/digi9/rates');


//INCODE Endpoints

define('INCODE_OMNI_START_ENDPOINT', '/omni/start');

define('INCODE_GET_URL_ENDPOINT', '/omni/onboarding-url');

define('INCODE_GET_SCORE_ENDPOINT', '/omni/get/score');


//MASSIVE Endpoints

define('MASSIVE_GET_QUOTE_ENDPOINT', '/api/v1/exchange/rate');

//EV Bank Endpoints

define('FV_BANK_ONBOARDING_ENDPOINT', '/api/fvbank/onboarding');
define('FVBANK_CREATE_VIRTUAL_ACCOUNT_ENDPOINT', '/api/fvbank/create-virtual-account');
define('FVBANK_FILE_UPLOAD_ENDPOINT', '/api/fvbank/upload-file');
define('FVBANK_GET_VIRTUAL_ACCOUNT_ENDPOINT', '/api/fvbank/virtual-account-details');
define('FVBANK_GET_VIRTUAL_ACCOUNT_BALAENCE_ENDPOINT', '/api/fvbank/virtual-account/balance');
define('FVBANK_CREATE_BENEFICIARY_ENDPOINT', '/api/fvbank/create-beneficiary');
define('FVBANK_GET_PAYMENT_TYPES_ENDPOINT', '/api/fvbank/payment-types');
define('FVBANK_GET_REQUIRED_FIELDS_ENDPOINT', '/api/fvbank/beneficiary/required-fields');
define('FV_BANK_USERS_LIST_ENDPOINT', '/api/fvbank/users/list');

//Surepass

define('SUREPASS_BANK_VERIFICATION_ENDPOINT', '/api/v1/bank-verification/');


//Compliance Service Endpoints

define('COMPLIANCE_ACCESS_TOKEN_ENDPOINT', '/api/v1/auth/login');

define('COMPLIANCE_CREATE_TRANSACTION_ENDPOINT', '/api/v1/transactions/remittance');

//Viyonapay
define('VIYONAPAY_AUTH_TOKEN_ENDPOINT', '/v1/auth/token');
define('VIYONAPAY_GET_TRANSACTION_STATUS_ENDPOINT', '/v1/payout/get_fund_transfer_status');
define('VIYONAPAY_GET_TRANSACTION_STATUS_ENDPOINT_V2', '/api/viyonapayV2/vvimhcquexduyfjx/nm7to63vxkaa1kwd/status');
define('VIYONAPAY_AUTH_TOKEN_ENDPOINT_V2', '/api/viyonapayV2/vvimhcquexduyfjx/lrszcdd9cpvluhju/access_token');


//Endpoints

define('INVOICEMATE_AUTH_TOKEN_ENDPOINT', '/api/auth/third-party/login');
define('INVOICEMATE_PAYOUT_ENDPOINT', '/api/webhook/eficyent/payouts');
define('INVOICEMATE_DEPOSIT_ENDPOINT', '/api/webhook/eficyent/deposits');

//ProcessingUnit

define('PROCESSING_UNIT_CREATE_TRANSACTION_ENDPOINT', '/api/v1/initiate-withdraw');
define('PROCESSING_UNIT_SYNC_TRANSACTION_ENDPOINT', '/api/v1/sync-withdraw');
define('PROCESSING_UNIT_CREATE_DEPOSIT_ENDPOINT', '/api/v1/initiate-deposit');
define('PROCESSING_UNIT_WITHDRAWAL_CHECK_STATUS_ENDPOINT', '/api/v1/view/withdraw');
define('PROCESSING_UNIT_VALIDATE_ACCOUNT_ENDPOINT', '/api/v1/verify_account');

// Remittance
define('REMITTANCE_INITIATE_WITHDRAWAL_ENDPOINT', '/api/v1/initiate_withdrawal');
