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
        if (!Schema::hasColumn('beneficiary_transactions', 'txn_ref_no')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('txn_ref_no')->nullable()->after('unique_id')->unique();
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'notes')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->text('notes')->nullable()->after('client_reference_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('beneficiary_transactions', function (Blueprint $table) {
            $table->dropColumn('txn_ref_no');
        });
    }
};
