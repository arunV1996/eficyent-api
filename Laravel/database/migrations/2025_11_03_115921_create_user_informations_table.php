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
        if (!Schema::hasTable('user_informations')) {
            Schema::create('user_informations', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('country', 100)->nullable();
                $table->string('address_1', 255)->nullable();
                $table->string('address_2', 255)->nullable();
                $table->string('city', 100)->nullable();
                $table->string('state', 100)->nullable();
                $table->string('postal_code', 50)->nullable();
                $table->text('purpose_of_transactions')->nullable();

                $table->string('legal_name', 255)->nullable();
                $table->string('tax_id', 100)->nullable();
                $table->date('formation_date')->nullable();
                $table->string('business_name', 255)->nullable();
                $table->string('website', 255)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->string('role', 100)->nullable();
                $table->json('business_persons')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_informations');
    }
};
