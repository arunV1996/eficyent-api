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
        Schema::create('accounts_viewers', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->string('name', 25);
            $table->string('email', 50)->unique();
            $table->string('password');
            $table->string('timezone', 30)->default(DEFAULT_TIMEZONE);
            $table->tinyInteger('status')->default(ACTIVE);
            $table->text('api_key')->nullable();
            $table->text('salt_key')->nullable();
            $table->timestamp('last_password_reset')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('accounts_viewers');
    }
};
