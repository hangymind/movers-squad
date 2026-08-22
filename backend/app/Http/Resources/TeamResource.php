<?php

namespace App\Http\Resources;

use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $memberCount = $this->whenCounted('members', $this->members_count);

        return [
            'id' => $this->id,
            'gameName' => $this->game_name,
            'note' => $this->note,
            'minLevel' => $this->min_level,
            'excludedFlorrIds' => $this->excluded_florr_ids ?? [],
            'owner' => new UserResource($this->whenLoaded('owner')),
            'members' => UserResource::collection($this->whenLoaded('members')),
            'memberCount' => $memberCount,
            'maxMembers' => Team::MAX_MEMBERS,
            'isFull' => $memberCount >= Team::MAX_MEMBERS,
            'isAssembled' => $this->assembled_at !== null,
            'assembledAt' => $this->assembled_at?->toISOString(),
            'closedAt' => $this->closed_at?->toISOString(),
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
