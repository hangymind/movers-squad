<?php

namespace App\Http\Resources;

use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $memberCount = (int) ($this->members_count ?? ($this->relationLoaded('members') ? $this->members->count() : $this->members()->count()));

        return [
            'id' => $this->id,
            'gameName' => $this->game_name,
            'note' => $this->note,
            'minLevel' => $this->min_level,
            'excludedFlorrIds' => $this->excluded_florr_ids ?? [],
            'owner' => new UserResource($this->whenLoaded('owner')),
            'members' => UserResource::collection($this->whenLoaded('members')),
            'memberCount' => $memberCount,
            'maxMembers' => $this->max_members ?? Team::MAX_MEMBERS,
            'isFull' => $memberCount >= ($this->max_members ?? Team::MAX_MEMBERS),
            'isAssembled' => $this->assembled_at !== null,
            'assembledAt' => $this->assembled_at?->toISOString(),
            'closedAt' => $this->closed_at?->toISOString(),
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
