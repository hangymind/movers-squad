<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('team.{teamId}', function (User $user, int $teamId): bool {
    return DB::table('team_members')
        ->where('team_id', $teamId)
        ->where('user_id', $user->id)
        ->exists();
}, ['guards' => ['sanctum']]);

Broadcast::channel('user.{userId}', fn (User $user, int $userId): bool => $user->id === $userId, ['guards' => ['sanctum']]);
