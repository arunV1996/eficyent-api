<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        if (!Schema::hasTable('external_service_calls')) {
            Schema::create('external_service_calls', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('beneficiary_transaction_id')->nullable()->index();
                $table->string('external_type');
                $table->string('action');
                $table->string('method')->nullable();
                $table->string('endpoint')->nullable();
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->integer('http_status')->nullable();
                $table->boolean('success')->default(false);
                $table->string('external_reference_id')->nullable();
                $table->text('error_message')->nullable();
                $table->integer('response_time_ms')->nullable();
                $table->timestamps();


                $table->foreign('beneficiary_transaction_id')
                    ->references('id')
                    ->on('beneficiary_transactions')
                    ->onDelete('cascade');
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'is_service_called')) {
            
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->boolean('is_service_called')->default(false)->after('status');
            });
        }
    }


    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('external_service_calls');
    }
};
