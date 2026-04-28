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
        if (!Schema::hasTable('beneficiary_transaction_proofs')) {
            Schema::create('beneficiary_transaction_proofs', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->unsignedBigInteger('beneficiary_transaction_id');
                $table->string('document_type');
                $table->tinyInteger('status')->default(PAYMENT_PROOF_REQUESTED);
                $table->text('file_url')->nullable();
                $table->timestamp('requested_at')->nullable();
                $table->timestamp('uploaded_at')->nullable();
                $table->timestamps();

                $table->foreign('beneficiary_transaction_id', 'bt_proofs_bt_id_fk')->references('id')->on('beneficiary_transactions')->cascadeOnDelete();
            });
        }

        if(!Schema::hasColumn('beneficiary_transaction_proofs', 'remitter_proof')) {
            Schema::table('beneficiary_transaction_proofs', function (Blueprint $table) {
                $table->text('remitter_proof')->nullable()->after('document_type');
            });
        }

        if(!Schema::hasColumn('beneficiary_transactions', 'order_id')) {
            Schema::table('beneficiary_transactions', function (Blueprint $table) {
                $table->string('order_id')->nullable()->after('txn_ref_no');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_transaction_proofs');
    }
};
