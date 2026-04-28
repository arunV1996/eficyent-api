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
        if (!Schema::hasColumn('beneficiary_accounts', 'intermediary_bank_aba')) {
            Schema::table('beneficiary_accounts', function (Blueprint $table) {
                $table->string('intermediary_bank_aba')->nullable()->after('intermediary_bank_name');
                $table->string('intermediary_bank_address')->nullable()->after('intermediary_bank_aba');
                $table->string('intermediary_bank_city')->nullable()->after('intermediary_bank_address');
                $table->string('intermediary_bank_state')->nullable()->after('intermediary_bank_city');
                $table->string('intermediary_bank_postal_code')->nullable()->after('intermediary_bank_state');
                $table->string('intermediary_bank_country')->nullable()->after('intermediary_bank_postal_code');
            });
        }

        if (!Schema::hasColumn('beneficiary_transactions', 'purpose_of_payment')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('purpose_of_payment')->nullable()->after('client_reference_id');
            });
        }

        if(!Schema::hasColumn('merchants','telegram_channel')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->string('telegram_channel')->nullable()->after('callback_url');
            });
        }

        if (!Schema::hasColumn('beneficiary_transactions', 'compliance_data')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->json('compliance_data')->nullable()->after('notes');
                $table->tinyInteger('compliance_status')->default(0)->after('compliance_data');
                $table->string('compliance_notes')->nullable()->after('compliance_status');
            });
        }

        if(Schema::hasColumn('deposit_transactions', 'external_type')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->string('external_type')->nullable()->change();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('beneficiary_accounts', function (Blueprint $table) {
            //
        });
    }
};
