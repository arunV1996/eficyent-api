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
        if (!Schema::hasTable('merchant_settings')) {
            Schema::create('merchant_settings', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id', 40)->unique();
                $table->foreignId('merchant_id')->constrained('merchants')->cascadeOnDelete();
                $table->string('key');
                $table->text('value');
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
            });
        }
        if (!Schema::hasColumn('merchants', 'callback_url')) {
            Schema::table('merchants', function (Blueprint $table) {
                $table->longText('callback_url')->nullable()->after('public_key');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('merchant_settings');
    }
};
