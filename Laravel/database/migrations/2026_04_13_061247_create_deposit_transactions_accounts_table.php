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
        if (!Schema::hasTable('deposit_transactions_accounts')) {
            Schema::create('deposit_transactions_accounts', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete()->nullable();
                $table->string('currency', 3);
                $table->decimal('total_amount', 15, 2)->default(0.00);
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'service_mid')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('service_mid')->nullable()->after('external_type');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('deposit_transactions_accounts');
    }
};
