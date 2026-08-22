<?php

namespace App\Http\Resources;

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
            'avatarUrl' => $this->avatar_url,
            'isAdmin' => $this->when($canViewPrivate, (bool) $this->is_admin),
            'isBanned' => $this->when($canViewPrivate, $this->banned_at !== null),
            'banId' => $this->when($canViewPrivate, $this->ban_id),
            'bannedAt' => $this->when($canViewPrivate, $this->banned_at?->toISOString()),
            'reverbKey' => $this->when($isSelf, (string) config('broadcasting.connections.reverb.key')),
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
