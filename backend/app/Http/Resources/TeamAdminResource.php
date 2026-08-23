<?php

namespace App\Http\Resources;

use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamAdminResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Team $team */
        $team = $this->resource;
        $memberCount = (int) ($team->members_count ?? $team->members->count());

        return [
            'id' => $team->id,
            'gameName' => $team->game_name,
            'note' => $team->note,
            'owner' => new UserResource($team->owner),
            'members' => UserResource::collection($team->members),
            'memberCount' => $memberCount,
            'maxMembers' => (int) ($team->max_members ?? Team::MAX_MEMBERS),
            'isFull' => $memberCount >= (int) ($team->max_members ?? Team::MAX_MEMBERS),
            'isAssembled' => $team->assembled_at !== null,
            'assembledAt' => $team->assembled_at?->toISOString(),
            'closedAt' => $team->closed_at?->toISOString(),
            'createdAt' => $team->created_at?->toISOString(),
        ];
    }
}
