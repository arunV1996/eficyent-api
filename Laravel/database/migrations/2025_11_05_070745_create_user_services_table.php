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
        if (!Schema::hasTable('user_services')) {

            Schema::create('user_services', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('user_id')->constrained()->onDelete('cascade');
                $table->string('service_type');
                $table->string('external_reference_id')->nullable();
                $table->json('external_data')->nullable();
                $table->string('external_status')->nullable();
                $table->string('status')->default(ONBOARDING_STATUS_PENDING);
                $table->tinyInteger('is_active')->default(ACTIVE);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('user_informations')) {

            if (!Schema::hasColumn('user_informations', 'id_type')) {

                Schema::table('user_informations', function (Blueprint $table) {
                    $table->string('id_type')->nullable()->after('purpose_of_transactions');
                    $table->string('id_number')->nullable()->after('id_type');
                });
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_services');
    }
};
