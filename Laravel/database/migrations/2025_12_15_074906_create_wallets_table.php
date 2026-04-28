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
        Schema::create('wallets', function (Blueprint $table) {
            $table->id();
            $table->string('unique_id')->unique();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('currency', 3);
            $table->decimal('balance', 20, 4)->default(0);
            $table->tinyInteger('status')->default(ACTIVE);
            $table->timestamps();
            $table->unique(['user_id', 'currency']);
            $table->index(['user_id', 'currency']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('wallets');
    }
};
