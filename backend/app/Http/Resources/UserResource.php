<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'florrId' => $this->florr_id,
            'level' => $this->level,
            'avatarUrl' => $this->avatar_url,
            'isAdmin' => (bool) $this->is_admin,
            'isBanned' => $this->banned_at !== null,
            'banId' => $this->ban_id,
            'bannedAt' => $this->banned_at?->toISOString(),
        ];
    }
}
