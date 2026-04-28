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
        Schema::table('beneficiary_transactions', function (Blueprint $table) {

            if (!Schema::hasColumn('beneficiary_transactions', 'remittance_data')) {
                $table->json('remittance_data')->nullable()->after('notes');
            }

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
         Schema::table('beneficiary_transactions', function (Blueprint $table) {
            $table->dropColumn('remittance_data');
        });
    }
};
