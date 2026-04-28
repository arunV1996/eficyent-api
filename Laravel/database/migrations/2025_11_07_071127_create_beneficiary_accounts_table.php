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

        if (!Schema::hasTable('beneficiary_accounts')) {
            Schema::create('beneficiary_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->nullable()->constrained()->onDelete('cascade');
                $table->string('currency', 3)->default(CURRENCY_USD);
                $table->string('country', 4)->default(COUNTRY_US);
                $table->tinyInteger('type')->nullable()->default(USER_TYPE_INDIVIDUAL);
                $table->string('first_name')->nullable();
                $table->string('middle_name')->nullable();
                $table->string('last_name')->nullable();
                $table->string('email')->nullable();
                $table->string('mobile_country_code')->nullable();
                $table->string('mobile')->nullable();
                $table->string('payment_rail')->nullable();
                $table->string('service_bank')->nullable();
                $table->string('bank_name')->nullable();
                $table->string('routing_number')->nullable();
                $table->string('account_name')->nullable();
                $table->string('account_number')->nullable();
                $table->string('account_type')->nullable();
                $table->string('swift_code')->nullable();
                $table->string('iban')->nullable();
                $table->string('intermediary_bank_swift_code')->nullable();
                $table->string('intermediary_bank_name')->nullable();
                $table->string('bank_country', 3)->nullable();
                $table->string('business_name')->nullable();
                $table->string('business_country', 3)->nullable();
                $table->string('external_type')->nullable();
                $table->string('external_reference_id')->nullable();
                $table->json('external_data')->nullable();
                $table->tinyInteger('status')->default(BENEFICIARY_ACCOUNT_PENDING);
                $table->timestamps();
                $table->softDeletes();

                $table->index(['user_id', 'status']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_accounts');
    }
};
