<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('geo_hunt_matches', function (Blueprint $table): void {
            $table->string('mode', 24)->default('ranked_1v1')->index();
            $table->foreignId('host_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('room_code', 6)->nullable()->unique();
            $table->string('room_name', 80)->nullable();
            $table->unsignedTinyInteger('max_players')->default(2);
            $table->timestamp('closed_at')->nullable();
        });

        Schema::table('geo_hunt_match_players', function (Blueprint $table): void {
            $table->timestamp('eliminated_at')->nullable();
            $table->unsignedTinyInteger('placement')->nullable();
        });

        Schema::table('geo_hunt_guesses', function (Blueprint $table): void {
            $table->unsignedInteger('damage_taken')->default(0);
            $table->unsignedInteger('hp_after')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('geo_hunt_guesses', function (Blueprint $table): void {
            $table->dropColumn(['damage_taken', 'hp_after']);
        });
        Schema::table('geo_hunt_match_players', function (Blueprint $table): void {
            $table->dropColumn(['eliminated_at', 'placement']);
        });
        Schema::table('geo_hunt_matches', function (Blueprint $table): void {
            $table->dropForeign(['host_id']);
            $table->dropUnique(['room_code']);
            $table->dropColumn(['mode', 'host_id', 'room_code', 'room_name', 'max_players', 'closed_at']);
        });
    }
};
