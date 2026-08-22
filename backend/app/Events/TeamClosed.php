<?php

namespace App\Events;

use App\Models\Team;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamClosed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly Team $team) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("team.{$this->team->id}")];
    }

    public function broadcastAs(): string
    {
        return 'TeamClosed';
    }

    public function broadcastWith(): array
    {
        return ['teamId' => $this->team->id, 'closedAt' => $this->team->closed_at?->toISOString()];
    }
}
