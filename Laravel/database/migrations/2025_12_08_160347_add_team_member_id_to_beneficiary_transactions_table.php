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
        if(!Schema::hasColumn('beneficiary_transactions', 'team_member_id')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->foreignId('team_member_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('team_members')
                    ->nullOnDelete();
            });
        }

        if(!Schema::hasColumn('beneficiary_accounts', 'team_member_id')) {
            
            Schema::table('beneficiary_accounts', function (Blueprint $table) {
                $table->foreignId('team_member_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('team_members')
                    ->nullOnDelete();
            });
        }

        if(!Schema::hasColumn('senders', 'team_member_id')) {
            
            Schema::table('senders', function (Blueprint $table) {
                $table->foreignId('team_member_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('team_members')
                    ->nullOnDelete();
            });
        }

        if(!Schema::hasColumn('states', 'country_alpha3')) {
            
            Schema::table('states', function (Blueprint $table) {
                $table->string('country_alpha3')->nullable()->after('country_code');
            });
        }

        if(!Schema::hasColumn('ledgers', 'description')) {
            
            Schema::table('ledgers', function (Blueprint $table) {
                
                $table->text('description')->nullable()->after('external_type');

                $table->foreignId('refund_ledger_id')->nullable()->after('description')->constrained('ledgers')->nullOnDelete();
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
