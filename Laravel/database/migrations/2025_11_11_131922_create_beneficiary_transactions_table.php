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
        Schema::create('beneficiary_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('beneficiary_account_id')->constrained()->onDelete('cascade');
            $table->foreignId('quote_id')->constrained()->onDelete('cascade');
            $table->decimal('amount', 15, 2)->default(0.00);
            $table->decimal('commission_amount', 15, 2)->default(0.00);
            $table->decimal('total_amount', 15, 2)->default(0.00);
            $table->decimal('recipient_amount', 15, 2)->default(0.00);
            $table->string('receiving_currency', 5)->nullable();
            $table->text('remarks')->nullable();
            $table->string('external_type')->default(EXTERNAL_TYPE_CALIZA);
            $table->string('external_reference_id')->nullable();
            $table->json('external_data')->nullable();
            $table->string('external_status')->nullable();
            $table->text('external_remarks')->nullable();
            $table->tinyInteger('status')->default(BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL);
            $table->timestamps();

            $table->index(['user_id', 'status', 'unique_id']);
            $table->index('external_reference_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_transactions');
    }
};
