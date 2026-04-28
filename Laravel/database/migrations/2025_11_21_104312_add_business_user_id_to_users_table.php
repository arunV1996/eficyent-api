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
        Schema::table('users', function (Blueprint $table) {
            //

            if (!Schema::hasColumn('users', 'business_user_id')) {

                $table->unsignedBigInteger('business_user_id')->nullable()->after('unique_id');

                $table->foreign('business_user_id')->references('id')->on('users')->onDelete('set null');

                $table->index('business_user_id');
            }

            $table->tinyInteger('is_tfa_setup_completed')->default(0)->after('password');

            $table->tinyInteger('is_tfa_enabled')->default(0)->after('is_tfa_setup_completed');

            $table->text('tfa_secret')->nullable()->after('is_tfa_enabled');

            $table->text('backup_codes')->nullable()->after('is_tfa_enabled');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            //
            $table->dropColumn('business_user_id');
        });
    }
};
