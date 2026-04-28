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
        if (!Schema::hasTable('support_members')) {
            Schema::create('support_members', function (Blueprint $table) {
                $table->id();
                $table->string('unique_id')->unique();
                $table->string('name', 25);
                $table->string('email', 50)->unique();
                $table->string('password');
                $table->timestamp('last_password_reset')->nullable();
                $table->string('timezone', 30)->default(DEFAULT_TIMEZONE);
                $table->tinyInteger('status')->default(ACTIVE);
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (!Schema::hasColumn('users', 'memo')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('memo')->nullable()->after('remember_token');
            });
        }

        if(Schema::hasColumn('users','password')){
            Schema::table('users', function (Blueprint $table) {
                $table->string('password')->nullable()->change();
            });
        }

        if(!Schema::hasColumn('support_members', 'modules')) {
            Schema::table('support_members', function (Blueprint $table) {
                $table->json('modules')->nullable()->after('status');
                $table->boolean('mask_data')->default(false)->after('modules');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('support_members');
    }
};
