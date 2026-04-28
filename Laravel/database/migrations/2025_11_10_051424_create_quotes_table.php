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
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('beneficiary_account_id')->nullable()->constrained('beneficiary_accounts')->cascadeOnDelete();
            $table->foreignId('virtual_account_id')->constrained('virtual_accounts')->cascadeOnDelete();
            $table->decimal('amount', 15, 2)->default(0.00);
            $table->decimal('commission_amount', 15, 2)->default(0.00);
            $table->decimal('commission_percentage', 15, 2)->default(0.00);
            $table->decimal('external_commission_amount', 15, 2)->default(0.00);
            $table->decimal('receiving_amount', 15, 2)->default(0.00);
            $table->string('fx_rate')->nullable();
            $table->string('quote_type')->default(QUOTE_TYPE_FORWARD);
            $table->tinyInteger('recipient_type')->default(USER_TYPE_INDIVIDUAL);
            $table->string('recipient_country', 10)->nullable();
            $table->string('receiving_currency', 5)->nullable();
            $table->string('payment_rail')->nullable();
            $table->tinyInteger('status')->default(QUOTE_NOT_SUBMITTED);
            $table->string('external_type')->default(EXTERNAL_TYPE_CALIZA);
            $table->string('external_reference_id')->nullable();
            $table->json('external_data')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index('expires_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quotes');
    }
};
