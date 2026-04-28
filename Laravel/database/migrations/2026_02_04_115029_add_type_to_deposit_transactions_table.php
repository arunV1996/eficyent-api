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
        if (!Schema::hasColumn('deposit_transactions', 'type')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                //
                $table->string('type')->default(DEPOSIT_TYPE_DEPOSIT)->after('status');
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'rail')) {

            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('rail')->nullable()->after('compliance_notes');
            });
        }

        if(!Schema::hasColumn('deposit_transactions','remarks')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->text('remarks')->nullable()->after('external_remarks');
            });
        }

        if (!Schema::hasColumn('team_members', 'sender_id')) {
            Schema::table('team_members', function (Blueprint $table) {
                $table->unsignedBigInteger('sender_id')->nullable()->after('user_id');
            });
        }

        if(!Schema::hasColumn('deposit_transactions', 'purpose_of_payment')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->string('purpose_of_payment')->nullable()->after('type');
                $table->string('source_of_funds')->nullable()->after('purpose_of_payment');
            });
        }

        if(!Schema::hasColumn('deposit_transactions', 'proof')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->string('proof', 255)->nullable()->after('source_of_funds');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('deposit_transactions', function (Blueprint $table) {
            //
            $table->dropColumn('type');
        });
    }
};
