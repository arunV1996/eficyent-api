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
        if (!Schema::hasTable('deposit_transaction_status_histories')) {

            Schema::create('deposit_transaction_status_histories', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->unsignedBigInteger('deposit_transaction_id');
                $table->string('from_status')->nullable();
                $table->string('to_status');
                $table->string('changed_by')->nullable();
                $table->string('changed_by_type')->nullable();
                $table->timestamp('changed_at');
                $table->json('meta')->nullable();
                $table->timestamps();

                $table->foreign('deposit_transaction_id', 'dt_status_hist_bt_id_fk')
                    ->references('id')
                    ->on('deposit_transactions')
                    ->onDelete('cascade');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('deposit_transaction_status_histories');
    }
};
