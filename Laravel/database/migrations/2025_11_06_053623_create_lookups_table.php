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
        if (!Schema::hasTable('lookups')) {
            Schema::create('lookups', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('key');
                $table->string('value');
                $table->string('type');
                $table->string('external_type')->default(EXTERNAL_TYPE_DIGININE);
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('lookups');
    }
};
