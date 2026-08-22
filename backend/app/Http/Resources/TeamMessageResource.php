<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TeamMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'teamId' => $this->team_id,
            'sender' => new UserResource($this->whenLoaded('sender')),
            'body' => $this->body,
            'createdAt' => $this->created_at?->toISOString(),
        ];
    }
}
