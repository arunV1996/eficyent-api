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
        if (!Schema::hasTable('beneficiary_transaction_status_histories')) {

            Schema::create('beneficiary_transaction_status_histories', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->unsignedBigInteger('beneficiary_transaction_id');
                $table->string('from_status')->nullable();
                $table->string('to_status');
                $table->string('changed_by')->nullable();
                $table->string('changed_by_type')->nullable();
                $table->timestamp('changed_at');
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->foreign('beneficiary_transaction_id', 'bt_status_hist_bt_id_fk')
                    ->references('id')
                    ->on('beneficiary_transactions')
                    ->onDelete('cascade');
            });
        }

        if (!Schema::hasColumn('team_members', 'email_code')) {

            Schema::table('team_members', function (Blueprint $table) {
                $table->string('email_code')->nullable()->after('password');
                $table->string('email_code_expiry')->nullable()->after('email_code');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_transaction_status_histories');
    }
};
