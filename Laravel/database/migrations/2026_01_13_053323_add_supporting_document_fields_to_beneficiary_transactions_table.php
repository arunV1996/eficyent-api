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
        if (!Schema::hasColumn('beneficiary_transactions', 'supporting_document')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('supporting_document')->nullable()->after('status');
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'client_reference_id')) {

            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('client_reference_id')->nullable()->after('supporting_document');
            });
        }

        if(!Schema::hasColumn('user_informations', 'country_of_incorporation')) {
            Schema::table('user_informations', function (Blueprint $table) {
                $table->string('country_of_incorporation')->nullable()->after('formation_date');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('beneficiary_transactions', function (Blueprint $table) {
            //
        });
    }
};
