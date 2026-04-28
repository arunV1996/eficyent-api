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
        if (!Schema::hasColumn('senders', 'client_reference_id')) {

            Schema::table('senders', function (Blueprint $table) {
                $table->string('client_reference_id')->nullable()->after('status');
            });
        }

        if (!Schema::hasColumn('deposit_transactions', 'client_reference_id')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->string('client_reference_id')->nullable()->after('external_remarks');
            });
        }

        if(!Schema::hasColumn('quotes', 'merchant_commission_amount')) {

            Schema::table('quotes', function (Blueprint $table) {
                $table->decimal('merchant_commission_amount', 15, 2)->nullable()->after('commission_amount');
            });
        }

        if(!Schema::hasColumn('quotes','internal_fx_rate')) {

            Schema::table('quotes', function (Blueprint $table) {
                $table->string('internal_fx_rate')->nullable()->after('fx_rate');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('senders', function (Blueprint $table) {
            //
        });
    }
};
