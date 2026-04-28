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
        Schema::create('team_members', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 50);
            $table->string('email', 50)->unique();
            $table->string('mobile_country_code')->nullable();
            $table->string('mobile')->nullable();
            $table->string('password');
            $table->longText('api_key')->nullable();
            $table->longText('salt_key')->nullable();
            $table->longText('private_key')->nullable();
            $table->longText('public_key')->nullable();
            $table->integer('role')->default(TEAM_MEMBER_ROLE_SUPPORT_MEMBER);
            $table->integer('permission')->default(TEAM_MEMBER_ROLE_OWNER);
            $table->string('timezone', 30)->default(DEFAULT_TIMEZONE);
            $table->tinyInteger('status')->default(ACTIVE);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('team_members');
    }
};
