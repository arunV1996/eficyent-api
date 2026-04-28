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
        Schema::table('deposit_transactions', function (Blueprint $table) {
            //
            $table->string('deposit_currency', 10)->nullable()->after('total_amount');
            $table->string('from_wallet_address', 255)->nullable()->after('deposit_currency');
            $table->foreignId('admin_wallet_id')->nullable()->after('from_wallet_address')->constrained('admin_wallets');
            $table->string('transaction_hash', 255)->nullable()->after('admin_wallet_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('deposit_transactions', function (Blueprint $table) {
            //
        });
    }
};
