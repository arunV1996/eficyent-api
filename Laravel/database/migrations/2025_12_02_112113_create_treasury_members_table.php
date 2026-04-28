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
        if (!Schema::hasTable('treasury_members')) {
            Schema::create('treasury_members', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('name', 25);
                $table->string('email', 50)->unique();
                $table->string('password');
                $table->string('timezone', 30)->default(DEFAULT_TIMEZONE);
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamp('last_password_reset')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasColumn('team_members', 'last_password_reset')) {
            Schema::table('team_members', function (Blueprint $table) {
                $table->timestamp('last_password_reset')->nullable()->after('password');
            });
        }

        if(!Schema::hasColumn('treasury_members', 'merchants')) {
            Schema::table('treasury_members', function (Blueprint $table) {
                $table->json('merchants')->nullable()->after('status');
            });
        }

        if (!Schema::hasColumn('treasury_members', 'api_key')) {
            Schema::table('treasury_members', function (Blueprint $table) {
                $table->text('api_key')->nullable()->after('password');
                $table->text('salt_key')->nullable()->after('api_key');
                $table->text('private_key')->nullable()->after('salt_key');
                $table->text('public_key')->nullable()->after('private_key');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('treasury_members');
    }
};
