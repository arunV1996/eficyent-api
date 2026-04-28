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
        if (!Schema::hasTable('beneficiary_additional_details')) {
            Schema::create('beneficiary_additional_details', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->foreignId('beneficiary_account_id')->constrained()->onDelete('cascade');
                $table->string('address_line1')->nullable();
                $table->string('address_line2')->nullable();
                $table->string('postal_code', 20)->nullable();
                $table->string('city')->nullable();
                $table->string('state')->nullable();
                $table->string('country', 3)->nullable();
                $table->string('bank_address_line1')->nullable();
                $table->string('bank_address_line2')->nullable();
                $table->string('bank_postal_code', 20)->nullable();
                $table->string('bank_city')->nullable();
                $table->string('bank_state')->nullable();
                $table->string('bank_country', 3)->nullable();
                $table->string('user_source_of_income')->nullable();
                $table->string('purpose_of_transaction')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if(Schema::hasTable('beneficiary_additional_details')) {
            Schema::table('beneficiary_additional_details', function (Blueprint $table) {
                $table->string('address_type')->nullable()->after('beneficiary_account_id');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('beneficiary_additional_details');
    }
};
