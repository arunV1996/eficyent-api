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
        if (!Schema::hasTable('deposit_transactions')) {

            Schema::create('deposit_transactions', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('virtual_account_id')->constrained('virtual_accounts')->cascadeOnDelete();
                $table->decimal('amount', 15, 2)->default(0.00);
                $table->decimal('commission_amount', 15, 2)->default(0.00);
                $table->decimal('total_amount', 15, 2)->default(0.00);
                $table->string('external_type')->default(EXTERNAL_TYPE_CALIZA);
                $table->string('external_reference_id')->nullable();
                $table->json('external_data')->nullable();
                $table->string('external_status')->nullable();
                $table->text('external_remarks')->nullable();
                $table->tinyInteger('status')->default(DEPOSIT_TRANSACTION_PENDING);
                $table->timestamps();
            });
        }

        if(!Schema::hasColumn('deposit_transactions', 'memo')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->string('memo')->nullable()->after('total_amount');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('deposit_transactions');
    }
};
