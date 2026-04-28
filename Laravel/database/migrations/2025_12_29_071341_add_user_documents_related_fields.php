<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_documents', function (Blueprint $table) {
            if (!Schema::hasColumn('user_documents', 'document_back_file')) {
                $table->string('document_back_file')->nullable()->after('document_file');
            }

            if (!Schema::hasColumn('user_documents', 'document_expiry_date')) {
                $table->date('document_expiry_date')->nullable()->after('document_back_file');
            }
        });

        Schema::table('user_informations', function (Blueprint $table) {
            $table->string('business_verification_type')->nullable()->after('purpose_of_transactions');
        });

        Schema::table('beneficiary_additional_details', function (Blueprint $table) {
            $table->string('payment_type')->nullable()->after('country');
        });
    }

    public function down(): void
    {
        Schema::table('user_documents', function (Blueprint $table) {
            $table->dropColumn(['document_back_file', 'document_expiry_date']);
        });
        Schema::table('user_informations', function (Blueprint $table) {
            $table->dropColumn(['business_verification_type']);
        });
        Schema::table('beneficiary_additional_details', function (Blueprint $table) {
            $table->dropColumn(['payment_type']);
        });
    }
};
