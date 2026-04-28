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
        Schema::create('virtual_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('country', 100)->default(COUNTRY_US);
            $table->string('currency', 100)->default(CURRENCY_USD);
            $table->string('account_number')->unique()->nullable();
            $table->string('account_holder_name')->nullable();
            $table->string('account_holder_address')->nullable();
            $table->string('account_bank_name')->nullable();
            $table->string('account_bank_code')->nullable();
            $table->string('account_bank_address')->nullable();
            $table->string('routing_number')->nullable();
            $table->string('external_type')->nullable();
            $table->string('external_reference_id')->nullable();
            $table->json('external_data')->nullable();
            $table->tinyInteger('status')->default(VIRTUAL_ACCOUNT_STATUS_PENDING);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('virtual_accounts');
    }
};
