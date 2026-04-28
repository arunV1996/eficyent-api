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
        Schema::create('supported_countries', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->string('country_name', 50);
            $table->string('country_code', 3);
            $table->string('currency', 3);
            $table->string('type',3)->nullable();
            $table->string('external_type')->nullable();
            $table->tinyInteger('status')->default(ACTIVE);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->json('service_providers')->after('user_type')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('supported_countries');
    }
};
