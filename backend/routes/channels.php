<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;

Broadcast::channel('team.{teamId}', function (User $user, int $teamId): bool {
    return DB::table('team_members')
        ->where('team_id', $teamId)
        ->where('user_id', $user->id)
        ->exists();
}, ['guards' => ['sanctum']]);

// All authenticated users can observe the public recruitment hall state.
Broadcast::channel('teams', fn (User $user): bool => $user->exists, ['guards' => ['sanctum']]);

Broadcast::channel('public-room', fn (User $user): bool => $user->exists && $user->banned_at === null, ['guards' => ['sanctum']]);

Broadcast::channel('user.{userId}', fn (User $user, int $userId): bool => $user->id === $userId, ['guards' => ['sanctum']]);

Broadcast::channel('geo-hunt.match.{matchId}', function (User $user, int $matchId): bool {
    return DB::table('geo_hunt_match_players')
        ->where('match_id', $matchId)
        ->where('user_id', $user->id)
        ->exists();
}, ['guards' => ['sanctum']]);

Broadcast::channel('geo-hunt.lobby', fn (User $user): bool => $user->florr_verified_at !== null && $user->banned_at === null, ['guards' => ['sanctum']]);
