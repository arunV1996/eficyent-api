<?php

use Illuminate\Http\Request;
use App\Services\FvBank\FvBank;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\LoginController;
use App\Http\Controllers\Api\LedgerController;
use App\Http\Controllers\Api\QuotesController;
use App\Http\Controllers\Api\SenderController;
use App\Http\Controllers\Api\WalletController;
use App\Http\Controllers\Api\DepositController;
use App\Http\Controllers\Api\LookupsController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\SubuserController;
use App\Http\Controllers\Api\RegisterController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\OnboardingController;
use App\Http\Controllers\Api\StaticPageController;
use App\Http\Controllers\Api\TeamMemberController;
use App\Http\Controllers\Api\VerifyEmailController;
use App\Http\Controllers\Api\ForgotPasswordController;
use App\Http\Controllers\Api\VirtualAccountController;
use App\Http\Controllers\Api\BeneficiaryAccountsController;
use App\Http\Controllers\Api\BeneficiaryTransactionController;
use App\Http\Controllers\Api\Callbacks\CalizaWebhookController;
use App\Http\Controllers\Api\Callbacks\ComplianceWebhookController;
use App\Http\Controllers\Api\Callbacks\FVBankWebhookController;
use App\Http\Controllers\Api\Callbacks\DiginineWebhookController;
use App\Http\Controllers\Api\Callbacks\ProcessingUnitWebhookController;
use App\Http\Controllers\Api\ComplianceAlignController;
use App\Http\Controllers\Api\RemittanceAlignController;
use App\Http\Controllers\Api\UsersController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/


Route::post('caliza-webhook', CalizaWebhookController::class);

Route::post('diginine-webhook', DiginineWebhookController::class);

Route::post('ef-webhook', FVBankWebhookController::class)->middleware('fvbankWebhookSignature');

Route::post('compliance/webhook-callback', ComplianceWebhookController::class);

Route::post('compliance/align', [ComplianceAlignController::class, 'compliance_align']);

Route::post('stable-coin-remittance/align', [RemittanceAlignController::class, 'stable_coin_remittance_align']);

Route::post('processingunit-webhook', ProcessingUnitWebhookController::class);

Route::group(['prefix' => 'user'], function () {

    Route::post('register', [RegisterController::class, 'register']);

    Route::post('verify-otp', [VerifyEmailController::class, 'verifyOtp'])->middleware('throttle:limited');

    Route::post('resend-otp', [VerifyEmailController::class, 'resendOtp'])->middleware('throttle:limited');

    Route::post('login', [LoginController::class, 'login'])->middleware('throttle:limited');

    Route::post('tfa-login', [LoginController::class, 'tfaLogin'])->middleware('throttle:limited');

    Route::get('get_settings', [SettingsController::class, 'get_app_settings']);

    Route::group(['prefix' => 'static-pages'], function () {

        Route::controller(StaticPageController::class)->group(function () {

            Route::get('list', 'index');

            Route::get('show', 'show');
        });
    });

    Route::prefix('lookups')->group(function () {

        Route::controller(LookupsController::class)->group(function () {

            Route::get('mobile_country_codes', 'mobile_country_codes');

            Route::get('countries', 'countries');

            Route::get('states', 'get_states');

            Route::get('payment_rails', 'payment_rails');

            Route::get('banks', 'banks');

            Route::get('deposit_lookups', 'deposit_lookups');

            Route::get('deposit_wallets', 'deposit_wallets');

            Route::get('test', 'test');  // TODO - remove
        });
    });

    Route::post('subusers/accept-invite', [SubuserController::class, 'accept_invite'])->middleware('throttle:limited');

    Route::prefix('forgot-password')->group(function () {

        Route::controller(ForgotPasswordController::class)->group(function () {

            Route::post('send-reset-link', 'send_reset_link')->middleware('throttle:limited');

            Route::post('verify-code', 'verify_code')->middleware('throttle:limited');

            Route::post('reset-password', 'reset_password')->middleware('throttle:limited');
        });
    });

    Route::post('retry-job/{jobId}', [BeneficiaryTransactionController::class, 'retry_job'])->middleware('throttle:limited');
    
    Route::post('retry_external_service/{trxn}', [BeneficiaryTransactionController::class, 'retry_external_service'])->middleware('throttle:limited');

    Route::post('retry_deposit/{trxn}', [DepositController::class, 'retry_deposit'])->middleware('throttle:limited');

    Route::get('check_external_service_status/{trxn}', [BeneficiaryTransactionController::class, 'check_external_service_status']);
    
    Route::group(['middleware' => ['auth:sanctum']], function () {

        Route::get('get-credentials', [ProfileController::class, 'get_credentials'])->middleware('email_should_be_verified','throttle:limited');

        Route::group(['middleware' => ['appSignature', 'ValidateMerchant']], function () {

            Route::group(['prefix' => 'dashboard'], function () {

                Route::controller(DashboardController::class)->group(function () {

                    Route::get('statistics', 'statistics');

                    Route::get('charts-data', 'charts_data');
                });
            });

            Route::controller(ProfileController::class)->group(function () {

                Route::get('profile',  'profile');

                Route::post('delete-account', 'delete_account');

                Route::get('check_user_status', 'check_user_status');

                Route::post('change-password',  'change_password');

                Route::get('setup-tfa', 'setup_tfa');

                Route::post('tfa-status', 'tfa_status');

                Route::post('regenerate-backup-codes', 'regenerate_backup_codes');

                Route::post('update-tour-status', 'update_tour_status');

                Route::get('update-profile-form-fields', 'update_profile_form_fields');

                Route::post('update-profile', 'update_profile');
            });

            Route::post('logout', [LoginController::class, 'logout']);

            Route::group(['middleware' => ['email_should_be_verified']], function () {

                Route::group(['prefix' => 'onboarding'], function () {

                    Route::get('get-form-fields', [OnboardingController::class, 'get_form_fields']);

                    Route::post('stepTwo', [OnboardingController::class, 'stepTwo']);

                    Route::post('stepThree', [OnboardingController::class, 'stepThree']);
                });

                Route::group(['middleware' => ['OnboardingShouldBeCompleted']], function () {

                    Route::group(['prefix' => 'accounts'], function () {

                        Route::get('list', [VirtualAccountController::class, 'index']);

                        Route::get('show', [VirtualAccountController::class, 'show']);

                        Route::get('available_banks', [VirtualAccountController::class, 'available_banks']);

                        Route::post('activate', [VirtualAccountController::class, 'activate']);

                        Route::get('get_virtual_Accounts', [VirtualAccountController::class, 'get_virtual_Accounts']);

                        Route::get('get_account_balance', [VirtualAccountController::class, 'get_balance']);

                        Route::get('balances', [VirtualAccountController::class, 'balances']);
                    });

                    Route::group(['prefix' => 'beneficiaries'], function () {

                        Route::controller(BeneficiaryAccountsController::class)->group(function () {

                            Route::get('get-form-fields', 'get_form_fields');

                            Route::get('list', 'index');

                            Route::post('validate_account', 'validate_account');

                            Route::post('store', 'store');

                            Route::get('show', 'show');

                            Route::delete('delete', 'delete');

                            Route::group(['prefix' => 'bulk'], function () {

                                Route::get('template', 'template');

                                Route::post('store', 'bulk_store');
                            });
                        });
                    });

                    Route::group(['prefix' => 'quotes'], function () {

                        Route::controller(QuotesController::class)->group(function () {

                            Route::post('store', 'store')->defaults('mode', QUOTE_MODE_QUOTATION);

                            Route::get('exchange-rate', 'store')->defaults('mode', QUOTE_MODE_RATE)->middleware('throttle:limited');
                        });
                    });

                    Route::group(['prefix' => 'beneficiary-transactions'], function () {

                        Route::controller(BeneficiaryTransactionController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::post('store', 'store');

                            Route::get('show', 'show');

                            Route::get('check_transaction_status', 'check_transaction_status');

                            Route::get('check_status', 'check_status');

                            Route::post('update-status', 'update_status');

                            Route::post('cancel', 'cancel')->middleware('throttle:limited');

                            Route::get('export', 'export')->middleware('throttle:limited');

                            Route::get('download', 'download_list')->middleware('throttle:limited');

                            Route::get('get-form-fields', 'get_form_fields');

                            Route::post('direct', 'direct');

                            Route::group(['prefix' => 'bulk'], function () {

                                Route::get('template', 'payout_template');

                                Route::post('store', 'bulk_store');
                            });

                            Route::group(['prefix' => 'instant'], function () {

                                Route::get('get-form-fields', 'instant_get_form_fields');

                                Route::post('store', 'instant');
                            });

                            Route::get('transaction-form-fields', 'transaction_form_fields');

                            Route::post('request-proof', 'request_proof')->middleware('throttle:limited');

                            Route::get('get-proof', 'get_proof')->middleware('throttle:limited');

                        });
                    });

                    Route::group(['prefix' => 'remitters', 'middleware' => ['senderAccess']], function () {

                        Route::controller(SenderController::class)->group(function () {

                            Route::get('get-form-fields', 'get_form_fields');

                            Route::get('list', 'index');

                            Route::post('store', 'store');

                            Route::post('update', 'update');

                            Route::get('show', 'show');

                            Route::delete('delete', 'delete');

                            Route::group(['prefix' => 'bulk'], function () {

                                Route::get('template', 'template');

                                Route::post('store', 'bulk_store');
                            });
                        });
                    });

                    Route::group(['prefix' => 'subusers', 'middleware' => ['businessUserAccess']], function () {

                        Route::controller(SubuserController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::post('store', 'store');

                            Route::get('show', 'show');

                            Route::delete('delete', 'delete');
                        });
                    });

                    Route::get('lookups/receiving_countries', [LookupsController::class, 'receiving_countries']);

                    Route::get('lookups/get-rates', [LookupsController::class, 'get_rates']);

                    Route::post('lookups/refresh-rates', [LookupsController::class, 'refresh_rates']);

                    Route::group(['prefix' => 'ledgers'], function () {

                        Route::controller(LedgerController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::get('show', 'show');

                            Route::get('export', 'export')->middleware('throttle:limited');
                        });
                    });

                    Route::group(['prefix' => 'deposits'], function () {

                        Route::controller(DepositController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::get('show', 'show');

                            Route::get('quote', 'quote');

                            Route::post('store', 'store')->middleware('throttle:limited');

                            Route::get('export', 'export')->middleware('throttle:limited');
                        });
                    });

                    Route::group(['prefix' => 'team-members', 'middleware' => ['businessUserAccess']], function () {

                        Route::controller(TeamMemberController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::post('create', 'store');

                            Route::get('show', 'show');

                            Route::post('update-status', 'update_status');

                            Route::post('update', 'update');

                            Route::delete('delete', 'destroy');
                        });
                    });

                    Route::group(['prefix' => 'wallets'], function () {

                        Route::controller(WalletController::class)->group(function () {

                            Route::get('list', 'index');

                            Route::get('show', 'show');

                            Route::post('convert', 'convert')->middleware('throttle:limited');
                        });

                        Route::group(['prefix' => 'transactions'], function () {

                            Route::controller((WalletController::class))->group(function () {

                                Route::get('list', 'transactions');

                                Route::get('show', 'show_transaction');
                            });
                        });
                    });

                    Route::group(['prefix' => 'users'], function () {

                        Route::controller(UsersController::class)->group(function () {

                            Route::get('list', 'index')->withoutMiddleware('ValidateMerchant');

                            Route::get('show', 'show')->withoutMiddleware('ValidateMerchant');
                        });
                    });
                });
            });
        });
    });
});
