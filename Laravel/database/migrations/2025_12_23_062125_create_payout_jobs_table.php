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
        Schema::create('payout_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id');
            $table->string('batch_id')->nullable();
            $table->integer('row_number')->nullable();
            $table->decimal('amount', 18, 2);
            $table->json('payload');
            $table->tinyInteger('status')->default(PAYOUT_JOB_STATUS_PENDING);
            $table->foreignId('beneficiary_transaction_id')->nullable();
            $table->text('error_message')->nullable();
            $table->integer('attempts')->default(0);
            $table->timestamps();

            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payout_jobs');
    }
};
