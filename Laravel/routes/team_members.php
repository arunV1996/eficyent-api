<?php

use App\Http\Controllers\TeamMembers\BeneficiaryAccountsController;
use App\Http\Controllers\TeamMembers\BeneficiaryTransactionController;
use App\Http\Controllers\TeamMembers\DashboardController;
use App\Http\Controllers\TeamMembers\DepositController;
use App\Http\Controllers\TeamMembers\ForgotPasswordController;
use App\Http\Controllers\TeamMembers\LedgerController;
use App\Http\Controllers\TeamMembers\LoginController;
use App\Http\Controllers\TeamMembers\LookupsController;
use App\Http\Controllers\TeamMembers\ProfileController;
use App\Http\Controllers\TeamMembers\QuotesController;
use App\Http\Controllers\TeamMembers\SenderController;
use App\Http\Controllers\TeamMembers\TeamMemberController;
use App\Http\Controllers\TeamMembers\VirtualAccountsController;
use App\Http\Controllers\TeamMembers\WalletController;
use Illuminate\Support\Facades\Route;

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


Route::group(['prefix' => 'corporate'], function () {

    Route::post('login', [LoginController::class, 'corporate_login'])->middleware('throttle:limited');
});


Route::group(['prefix' => 'team'], function () {

    Route::post('login', [LoginController::class, 'login'])->middleware('throttle:limited');

    Route::post('force-reset-password', [ForgotPasswordController::class, 'force_reset_password']);

    Route::get('get_settings', [ProfileController::class, 'get_app_settings']);

    Route::prefix('lookups')->group(function () {

        Route::controller(LookupsController::class)->group(function () {

            Route::get('mobile_country_codes', 'mobile_country_codes');

            Route::get('countries', 'countries');

            Route::get('states', 'get_states');

            Route::get('payment_rails', 'payment_rails');

            Route::get('deposit_lookups', 'deposit_lookups');

            Route::get('deposit_wallets', 'deposit_wallets');

        });
    });

    Route::prefix('forgot-password')->group(function () {

        Route::controller(ForgotPasswordController::class)->group(function () {

            Route::post('send-reset-link', 'send_reset_link')->middleware('throttle:limited');

            Route::post('verify-code', 'verify_code')->middleware('throttle:limited');

            Route::post('reset-password', 'reset_password')->middleware('throttle:limited');
        });
    });

    Route::group(['middleware' => ['auth:team', 'passwordReset']], function () {

        Route::get('get-credentials', [ProfileController::class, 'get_credentials'])->middleware('throttle:limited');

        Route::group(['middleware' => ['appSignature']], function () {

            Route::post('logout', [LoginController::class, 'logout']);

            Route::controller(ProfileController::class)->group(function () {

                Route::get('profile', 'profile');

                Route::post('change-password',  'change_password');
            });

            Route::controller(VirtualAccountsController::class)->group(function () {

                Route::prefix('accounts')->group(function () {

                    Route::get('list', 'index');

                    Route::get('show', 'show');

                    Route::get('get_account_balance', 'get_balance');
                });
            });

            Route::group(['prefix' => 'deposits'], function () {

                Route::controller(DepositController::class)->group(function () {

                    Route::get('list', 'index');

                    Route::get('quote', 'quote');

                    Route::post('store', 'store')->middleware('throttle:limited');

                    Route::get('show', 'show');

                    Route::get('export', 'export')->middleware('throttle:limited');
                });
            });

            Route::group(['prefix' => 'beneficiaries'], function () {

                Route::controller(BeneficiaryAccountsController::class)->group(function () {

                    Route::get('get-form-fields', 'get_form_fields');

                    Route::get('list', 'index');

                    Route::post('store', 'store');

                    Route::get('show', 'show');

                    Route::delete('delete', 'delete');

                    Route::group(['prefix' => 'bulk'], function () {

                        Route::get('template', 'template');

                        Route::post('store', 'bulk_store');
                    });
                });
            });

            Route::group(['prefix' => 'remitters'], function () {

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

            Route::group(['prefix' => 'quotes'], function () {

                Route::controller(QuotesController::class)->group(function () {

                    Route::post('store', 'store')->defaults('mode', QUOTE_MODE_QUOTATION)->middleware('throttle:limited');

                    Route::get('exchange-rate', 'store')->defaults('mode', QUOTE_MODE_RATE)->middleware('throttle:limited');
                });
            });

            Route::group(['prefix' => 'beneficiary-transactions'], function () {

                Route::controller(BeneficiaryTransactionController::class)->group(function () {

                    Route::get('list', 'index');

                    Route::post('store', 'store')->middleware(['throttle:limited', 'makerAccess']);

                    Route::get('show', 'show');

                    Route::get('check_transaction_status', 'check_transaction_status')->middleware('throttle:limited');

                    Route::post('update-status', 'update_status')->middleware(['throttle:limited', 'checkerAccess']);

                    Route::post('cancel', 'cancel')->middleware(['throttle:limited']);

                    Route::get('export', 'export')->middleware('throttle:limited');

                    Route::get('get-form-fields', 'get_form_fields');

                    Route::post('direct', 'direct');

                    Route::get('download', 'download_list')->middleware('throttle:limited');

                    Route::group(['prefix' => 'bulk'], function () {

                        Route::get('template', 'payout_template');

                        Route::post('store', 'bulk_store')->middleware('throttle:limited');
                    });

                    Route::get('transaction-form-fields', 'transaction_form_fields');

                    Route::post('request-proof', 'request_proof')->middleware('throttle:limited');

                    Route::get('get-proof', 'get_proof')->middleware('throttle:limited');
                });
            });

            Route::group(['middleware' => ['ownerAccess']], function () {

                Route::group(['prefix' => 'team-members'], function () {

                    Route::controller(TeamMemberController::class)->group(function () {

                        Route::get('list', 'index');

                        Route::post('create', 'store');

                        Route::get('show', 'show');

                        Route::post('update', 'update');

                        Route::post('update-status', 'update_status');

                        Route::delete('delete', 'destroy');
                    });
                });
            });

            Route::group(['prefix' => 'ledgers'], function () {

                Route::controller(LedgerController::class)->group(function () {

                    Route::get('list', 'index');

                    Route::get('show', 'show');

                    Route::get('export', 'export')->middleware('throttle:limited');
                });
            });

            Route::get('lookups/receiving_countries', [LookupsController::class, 'receiving_countries']);

            Route::get('lookups/get-rates', [LookupsController::class, 'get_rates']);

            Route::post('lookups/refresh-rates', [LookupsController::class, 'refresh_rates']);

            Route::group(['prefix' => 'dashboard'], function () {

                Route::controller(DashboardController::class)->group(function () {

                    Route::get('statistics', 'statistics');

                    Route::get('charts-data', 'charts_data');
                });
            });

            Route::group(['prefix' => 'wallets'], function () {

                Route::controller(WalletController::class)->group(function () {

                    Route::get('list', 'index');

                    Route::get('show', 'show');

                    Route::post('convert', 'convert')->middleware(['throttle:limited', 'ownerAccess']);

                    Route::group(['prefix' => 'transactions'], function () {

                        Route::controller((WalletController::class))->group(function () {

                            Route::get('list', 'transactions');

                            Route::get('show', 'show_transaction');
                        });
                    });
                });
            });
        });
    });
});
