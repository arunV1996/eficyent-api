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
        if (!Schema::hasTable('senders')) {
            Schema::create('senders', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained()->onDelete('cascade');
                $table->string('title', 5)->nullable();
                $table->string('first_name', 100)->nullable();
                $table->string('middle_name', 100)->nullable();
                $table->string('last_name', 100)->nullable();
                $table->string('email');
                $table->string('mobile_country_code')->nullable();
                $table->string('mobile')->nullable();
                $table->date('dob')->nullable();
                $table->string('country', 100)->nullable();
                $table->string('address_1', 255)->nullable();
                $table->string('address_2', 255)->nullable();
                $table->string('city', 100)->nullable();
                $table->string('state', 100)->nullable();
                $table->string('postal_code', 50)->nullable();
                $table->tinyInteger('type')->nullable()->default(USER_TYPE_INDIVIDUAL);
                $table->string('id_type')->nullable();
                $table->string('id_number')->nullable();
                $table->string('source_of_funds')->nullable();
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasColumn('users', 'enable_sender')) {
            Schema::table('users', function (Blueprint $table) {
                $table->tinyInteger('enable_sender')->default(NO)->after('id_verification');
            });
        }

        if (!Schema::hasColumn('beneficiary_transactions', 'sender_id')) {

            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->foreignId('sender_id')->nullable()->constrained('senders')->onDelete('cascade')->after('beneficiary_account_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('senders');
    }
};
