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
        if (!Schema::hasTable('static_pages')) {
            Schema::create('static_pages', function (Blueprint $table) {
                $table->id();

                $table->string('unique_id')->index();
                $table->string('title')->index();
                $table->longText('description');

                $table->enum('type', [
                    'about',
                    'privacy',
                    'terms',
                    'refund',
                    'cancellation',
                    'others',
                ])->default('others');

                $table->tinyInteger('footer_section')->default(0);
                $table->tinyInteger('status')->default(1);

                $table->timestamps();
            });
        }

        if (Schema::hasColumn('static_pages', 'type')) {

            Schema::table('static_pages', function (Blueprint $table) {
                $table->enum('type', [
                    'about',
                    'privacy',
                    'terms',
                    'refund',
                    'cancellation',
                    'others',
                    'help',
                    'contact',
                    'faq',
                ])->default('others')->change();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('static_pages');
    }
};
