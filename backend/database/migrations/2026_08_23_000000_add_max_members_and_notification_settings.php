<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('teams', function (Blueprint $table): void {
            $table->unsignedTinyInteger('max_members')->default(4)->after('excluded_florr_ids');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('show_join_notifications')->default(true);
            $table->boolean('show_team_created_notifications')->default(true);
            $table->boolean('show_member_left_notifications')->default(true);
            $table->boolean('notification_sound_enabled')->default(true);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'show_join_notifications',
                'show_team_created_notifications',
                'show_member_left_notifications',
                'notification_sound_enabled',
            ]);
        });
        Schema::table('teams', fn (Blueprint $table) => $table->dropColumn('max_members'));
    }
};
