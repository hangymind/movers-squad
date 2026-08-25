<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('geo_hunt_profiles', function (Blueprint $table): void {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('level')->default(1);
            $table->unsignedBigInteger('experience')->default(0);
            $table->unsignedInteger('wins')->default(0);
            $table->unsignedInteger('losses')->default(0);
            $table->unsignedInteger('matches_played')->default(0);
            $table->timestamps();
        });

        Schema::create('geo_hunt_queue_entries', function (Blueprint $table): void {
            $table->foreignId('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->timestamp('joined_at')->useCurrent()->index();
            $table->timestamp('heartbeat_at')->useCurrent()->index();
        });

        Schema::create('geo_hunt_matches', function (Blueprint $table): void {
            $table->id();
            $table->string('status', 20)->default('playing')->index();
            $table->unsignedInteger('round_number')->default(1);
            $table->unsignedInteger('state_version')->default(1);
            $table->foreignId('winner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ended_reason', 24)->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('xp_awarded_at')->nullable();
            $table->timestamps();
        });

        Schema::create('geo_hunt_match_players', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('match_id')->constrained('geo_hunt_matches')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('seat');
            $table->unsignedInteger('hp')->default(6000);
            $table->timestamp('heartbeat_at')->useCurrent()->index();
            $table->timestamp('forfeited_at')->nullable();
            $table->unsignedInteger('xp_awarded')->default(0);
            $table->unique(['match_id', 'user_id']);
            $table->unique(['match_id', 'seat']);
            $table->index(['user_id', 'match_id']);
        });

        Schema::create('geo_hunt_rounds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('match_id')->constrained('geo_hunt_matches')->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->string('map_key', 100);
            $table->double('target_x');
            $table->double('target_y');
            $table->unsignedInteger('crop_x');
            $table->unsignedInteger('crop_y');
            $table->unsignedInteger('crop_size');
            $table->decimal('multiplier', 4, 1)->default(1);
            $table->timestamp('started_at');
            $table->timestamp('deadline_at')->index();
            $table->timestamp('first_guess_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('reveal_until')->nullable();
            $table->foreignId('damaged_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('damage')->default(0);
            $table->unique(['match_id', 'number']);
        });

        Schema::create('geo_hunt_guesses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('round_id')->constrained('geo_hunt_rounds')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->double('x')->nullable();
            $table->double('y')->nullable();
            $table->double('distance_tiles')->nullable();
            $table->unsignedInteger('score')->default(0);
            $table->boolean('timed_out')->default(false);
            $table->timestamp('submitted_at');
            $table->unique(['round_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('geo_hunt_guesses');
        Schema::dropIfExists('geo_hunt_rounds');
        Schema::dropIfExists('geo_hunt_match_players');
        Schema::dropIfExists('geo_hunt_matches');
        Schema::dropIfExists('geo_hunt_queue_entries');
        Schema::dropIfExists('geo_hunt_profiles');
    }
};
