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
        if (!Schema::hasTable('service_banks')) {

            Schema::create('service_banks', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('bank_id')->unique();
                $table->string('bank_name');
                $table->string('country', 3);
                $table->string('currency', 10)->nullable();
                $table->string('service_type', 3)->nullable();
                $table->string('external_type', 11)->nullable();
                $table->string('status')->default(ACTIVE);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        Schema::table('beneficiary_accounts', function (Blueprint $table) {
            if (!Schema::hasColumn('beneficiary_accounts', 'service_bank')) {
                $table->string('service_bank')->nullable()->after('bank_name');
            }
        });

        Schema::table('user_informations', function (Blueprint $table) {
            if (!Schema::hasColumn('user_informations', 'source_of_income')) {
                $table->string('source_of_income', 11)->nullable()->after('profession');
            }
        });

        Schema::table('users', function (Blueprint $table) {
           
            if(!Schema::hasColumn('users', 'tour_status')) {
                $table->tinyInteger('tour_status')->after('status')->default(0);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_banks');
    }
};
