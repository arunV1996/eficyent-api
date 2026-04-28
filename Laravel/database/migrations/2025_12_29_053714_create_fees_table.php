<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('fees')) {
            Schema::create('fees', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->nullableMorphs('owner');
                $table->string('fee_name');
                $table->string('fee_type')->default(FEE_TYPE_FIXED);
                $table->decimal('fee_value', 15, 6);
                $table->char('currency_1', 3)->nullable();
                $table->char('currency_2', 3)->nullable();
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
            });
        }

        if(Schema::hasTable('user_fees')) {

            Schema::drop('user_fees');
        }

        if(Schema::hasTable('merchant_fees')) {

            Schema::drop('merchant_fees');
        }

        if(!Schema::hasColumn('deposit_transactions', 'external_commission_amount')) {

            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->decimal('external_commission_amount', 15, 2)->default(0.00)->after('commission_amount');
                $table->decimal('merchant_commission_amount', 15, 2)->default(0.00)->after('external_commission_amount');
                $table->decimal('total_commission_amount', 15, 2)->default(0.00)->after('merchant_commission_amount');
            });
        }

        if(!Schema::hasColumn('fees', 'mode')) {
            
            Schema::table('fees', function (Blueprint $table) {
                $table->string('mode')->nullable()->after('fee_type')->comment('ACH, WIRE, SWIFT');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('fees');
    }
};
