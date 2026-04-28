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

        if (!Schema::hasTable('merchants')) {

            Schema::create('merchants', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id', 40)->unique();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->string('name');
                $table->string('email')->unique();
                $table->string('password');
                $table->longText('api_key')->nullable();
                $table->longText('salt_key')->nullable();
                $table->longText('private_key')->nullable();
                $table->longText('public_key')->nullable();
                $table->tinyInteger('type')->default(MERCHANT_TYPE_PAYOUT);
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if(Schema::hasColumn('users', 'merchant_id')) {

            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('merchant_id');
            });
        }

        if (!Schema::hasColumn('users', 'merchant_id')) {

            Schema::table('users', function (Blueprint $table) {
                $table->unsignedBigInteger('merchant_id')->nullable()->after('unique_id');
            });
        }

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('merchant_id')->references('id')->on('merchants')->cascadeOnDelete();
        });
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('merchants');
    }
};
