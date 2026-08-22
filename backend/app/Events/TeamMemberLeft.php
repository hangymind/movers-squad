<?php

namespace App\Events;

use App\Models\Team;
use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamMemberLeft implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly Team $team, public readonly User $user) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("team.{$this->team->id}"), new PrivateChannel('teams')];
    }

    public function broadcastAs(): string
    {
        return 'TeamMemberLeft';
    }

    public function broadcastWith(): array
    {
        return [
            'teamId' => $this->team->id,
            'user' => ['id' => $this->user->id, 'florrId' => $this->user->florr_id],
            'leftAt' => now()->toISOString(),
        ];
    }
}
