<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('quotes', 'source_id')) {

            Schema::table('quotes', function (Blueprint $table) {
                $table->unsignedBigInteger('virtual_account_id')->nullable()->change();
                $table->unsignedBigInteger('source_id')->nullable()->after('virtual_account_id');
                $table->string('source_type')->nullable()->after('source_id');
            });
        }

        if(!Schema::hasColumn('wallet_transactions', 'type')) {
            
            Schema::table('wallet_transactions', function (Blueprint $table) {
                
                $table->tinyInteger('type')->default(TRANSACTION_TYPE_DEBIT)->after('total_amount');
            });
        }

        if(!Schema::hasColumn('quotes','total_sending_amount')) {

            Schema::table('quotes', function (Blueprint $table) {
                $table->decimal('total_sending_amount', 15, 2)->nullable()->after('amount');
            });
        }

        if(!Schema::hasColumn('wallet_transactions', 'balance_before')) {

            Schema::table('wallet_transactions', function (Blueprint $table) {
                $table->decimal('balance_before', 15, 2)->nullable()->after('total_amount');
                $table->decimal('balance_after', 15, 2)->nullable()->after('balance_before');
            });
        }

        if(!Schema::hasColumn('wallet_transactions', 'beneficiary_transaction_id')) {
            
            Schema::table('wallet_transactions', function (Blueprint $table) {
                $table->unsignedBigInteger('beneficiary_transaction_id')->nullable()->constrained('beneficiary_transactions')->after('quote_id');
            });
        }

        if (Schema::hasColumn('ledgers', 'virtual_account_id')) {

            Schema::table('ledgers', function (Blueprint $table) {
                $table->unsignedBigInteger('virtual_account_id')->nullable()->change();
            });
        }

        if(!Schema::hasColumn('ledgers', 'wallet_id')) {
            
            Schema::table('ledgers', function (Blueprint $table) {
                $table->unsignedBigInteger('wallet_id')->nullable()->after('virtual_account_id');
            });
        }

        if(!Schema::hasColumn('senders', 'nationality')) {

            Schema::table('senders', function (Blueprint $table) {
                $table->string('nationality')->nullable()->after('country');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('quotes', function (Blueprint $table) {
            //
        });
    }
};
