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
        if (!Schema::hasTable('admin_wallets')) {

            Schema::create('admin_wallets', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('wallet_name', 50);
                $table->string('wallet_address', 255);
                $table->string('network', 50)->nullable();
                $table->tinyInteger('status')->default(ACTIVE);
                $table->softDeletes();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('admin_wallets');
    }
};
