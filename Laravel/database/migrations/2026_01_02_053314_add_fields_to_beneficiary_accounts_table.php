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

        if (!Schema::hasTable('beneficiary_account_validations')) {

            Schema::create('beneficiary_account_validations', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained()->onDelete('cascade');
                $table->string('account_name')->nullable();
                $table->string('account_number')->unique();
                $table->string('code')->nullable();
                $table->string('validation_service')->nullable();
                $table->string('external_reference_id')->nullable();
                $table->string('external_status')->nullable();
                $table->json('external_data')->nullable();
                $table->text('remarks')->nullable();
                $table->tinyInteger('is_account_exists')->default(0);
                $table->tinyInteger('is_nre_account')->default(0);
                $table->tinyInteger('status')->default(BENEFICIARY_ACCOUNT_VALIDATION_STATUS_PENDING);
                $table->timestamps();
            });
        }

        if (!Schema::hasColumn('deposit_transactions', 'team_member_id')) {
            Schema::table('deposit_transactions', function (Blueprint $table) {
                $table->foreignId('team_member_id')
                    ->nullable()
                    ->after('user_id')
                    ->constrained('team_members')
                    ->nullOnDelete();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_account_validations');
    }
};
