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
        if (!Schema::hasTable('users')) {

            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('merchant_id')->nullable();
                $table->string('title', 5)->nullable();
                $table->string('first_name', 100)->nullable();
                $table->string('middle_name', 100)->nullable();
                $table->string('last_name', 100)->nullable();
                $table->string('email')->unique();
                $table->string('email_code')->nullable();
                $table->string('email_code_expiry')->nullable();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('mobile_country_code')->nullable();
                $table->string('mobile')->unique()->nullable();
                $table->string('password');
                $table->string('gender', 5)->nullable();
                $table->date('dob')->nullable();
                $table->string('picture')->default(asset('placeholders/placeholder.png'));
                $table->tinyInteger('user_type')->default(USER_TYPE_PENDING);
                $table->tinyInteger('user_role')->nullable();
                $table->tinyInteger('onboarding_step')->default(ONBOARDING_STEP_ONE_COMPLETED);
                $table->tinyInteger('id_verification')->default(IDENTITY_VERIFICATION_PENDING);
                $table->text('api_key')->nullable();
                $table->text('salt_key')->nullable();
                $table->text('private_key')->nullable();
                $table->text('public_key')->nullable();
                $table->tinyInteger('status')->default(USER_APPROVED);
                $table->string('timezone', 30)->default(DEFAULT_TIMEZONE);
                $table->string('browser_id', 255)->nullable();
                $table->rememberToken();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if(!Schema::hasColumn('users', 'id_verified_by')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('id_verified_by')->nullable()->after('id_verification');
                $table->json('id_verification_data')->nullable()->after('id_verified_by');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
