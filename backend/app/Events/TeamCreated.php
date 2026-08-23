<?php

namespace App\Events;

use App\Http\Resources\TeamResource;
use App\Models\Team;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly Team $team) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('teams')];
    }

    public function broadcastAs(): string
    {
        return 'TeamCreated';
    }

    public function broadcastWith(): array
    {
        $team = $this->team->loadMissing(['owner', 'members']);

        return ['teamId' => $team->id, 'team' => (new TeamResource($team))->resolve()];
    }
}
