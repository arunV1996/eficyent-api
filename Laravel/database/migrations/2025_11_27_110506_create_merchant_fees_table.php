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
        Schema::create('merchant_fees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('merchant_id')->constrained('merchants')->cascadeOnDelete();
            $table->string('fee_name');
            $table->string('mode')->nullable()->comment('ACH, WIRE, SWIFT');
            $table->string('fee_type')->default(FEE_TYPE_FIXED);
            $table->tinyInteger('user_type')->nullable();
            $table->decimal('fee_value', 15, 2)->default(0.00);
            $table->tinyInteger('status')->default(ACTIVE);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('merchant_fees');
    }
};
