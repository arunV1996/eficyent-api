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
        Schema::table('service_banks', function (Blueprint $table) {
            $table->string('iso_code')->nullable()->after('bank_name');
        });
    }

    public function down()
    {
        Schema::table('service_banks', function (Blueprint $table) {
            $table->dropColumn('iso_code');
        });
    }
};
