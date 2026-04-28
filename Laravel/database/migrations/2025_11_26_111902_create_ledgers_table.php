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
        Schema::create('ledgers', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('virtual_account_id')->constrained('virtual_accounts')->cascadeOnDelete()->nullable();
            $table->string('transaction_type')->nullable();
            $table->unsignedBigInteger('transaction_id')->nullable();
            $table->decimal('balance', 15, 2)->default(0.00);
            $table->string('external_type')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'virtual_account_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ledgers');
    }
};
