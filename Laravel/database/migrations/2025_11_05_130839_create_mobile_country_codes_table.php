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
        Schema::create('mobile_country_codes', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->string('country_name', 50);
            $table->string('isd_code', 8);
            $table->string('alpha_2_code', 5);
            $table->string('alpha_3_code', 5);
            $table->tinyInteger('status')->default(ACTIVE);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mobile_country_codes');
    }
};
