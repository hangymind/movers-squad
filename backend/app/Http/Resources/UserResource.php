<?php

namespace App\Http\Resources;

use App\Rules\SafeAvatarUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $isSelf = $request->user()?->id === $this->id;
        $canViewPrivate = $isSelf || (bool) $request->user()?->is_admin;
        $binding = $isSelf ? $this->latestFlorrBinding()->first() : null;

        return [
            'id' => $this->id,
            'florrId' => $this->florr_id,
            'level' => $this->level,
            'isFlorrVerified' => $this->florr_verified_at !== null,
            'avatarUrl' => SafeAvatarUrl::isValid($this->avatar_url) ? $this->avatar_url : null,
            'isAdmin' => $this->when($canViewPrivate, (bool) $this->is_admin),
            'isBanned' => $this->when($canViewPrivate, $this->banned_at !== null),
            'banId' => $this->when($canViewPrivate, $this->ban_id),
            'bannedAt' => $this->when($canViewPrivate, $this->banned_at?->toISOString()),
            'reverbKey' => $this->when($isSelf, (string) config('broadcasting.connections.reverb.key')),
            'notificationSettings' => $this->when($isSelf, fn () => [
                'showJoinNotifications' => (bool) $this->show_join_notifications,
                'showTeamCreatedNotifications' => (bool) $this->show_team_created_notifications,
                'showMemberLeftNotifications' => (bool) $this->show_member_left_notifications,
                'notificationSoundEnabled' => (bool) $this->notification_sound_enabled,
            ]),
            'geoHuntProfile' => $this->when($isSelf, function (): array {
                $profile = $this->geoHuntProfile()->firstOrCreate();
                $floor = 50 * ($profile->level - 1) * $profile->level;
                $next = 50 * $profile->level * ($profile->level + 1);

                return [
                    'level' => $profile->level,
                    'experience' => $profile->experience,
                    'experienceIntoLevel' => $profile->experience - $floor,
                    'experienceForNextLevel' => $next - $floor,
                    'wins' => $profile->wins,
                    'losses' => $profile->losses,
                    'matchesPlayed' => $profile->matches_played,
                ];
            }),
            'florrBinding' => $this->when($isSelf, fn () => [
                'id' => $binding?->id,
                'status' => $this->florr_verified_at !== null ? 'approved' : ($binding?->status ?? 'unbound'),
                'submittedAt' => $binding?->created_at?->toISOString(),
                'reviewedAt' => $binding?->reviewed_at?->toISOString(),
                'rejectionReason' => $binding?->rejection_reason,
                'resultUnread' => $binding?->reviewed_at !== null && $binding?->result_seen_at === null,
            ]),
        ];
    }
}
