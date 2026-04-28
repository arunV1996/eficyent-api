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
        Schema::table('quotes', function (Blueprint $table) {
            //
            $table->string('external_fx_rate')->nullable()->after('fx_rate');
            $table->tinyInteger('commission_type')->nullable()->after('amount');
            $table->decimal('commission_value', 15, 4)->default(0)->after('commission_type');

            $table->dropColumn([
                'commission_percentage',
            ]);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('quotes', function (Blueprint $table) {
            //
        });
    }
};
