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
        if (!Schema::hasTable('sender_documents')) {
            Schema::create('sender_documents', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('sender_id')->constrained('senders')->cascadeOnDelete();
                $table->string('document_name', 100)->nullable();
                $table->string('document_type', 100)->nullable();
                $table->string('document_country', 100)->nullable();
                $table->string('document_file', 255)->nullable();
                $table->tinyInteger('status')->default(IDENTITY_VERIFICATION_PENDING);
                $table->timestamp('verified_at')->nullable();
                $table->text('remarks')->nullable();
                $table->timestamps();
            });
        }

        if(!Schema::hasColumn('senders', 'business_persons')) {
            Schema::table('senders', function (Blueprint $table) {
                $table->json('business_persons')->nullable()->after('source_of_funds');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sender_documents');
    }
};
