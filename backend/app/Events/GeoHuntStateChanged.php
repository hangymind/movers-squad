<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GeoHuntStateChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly int $matchId, public readonly int $stateVersion) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("geo-hunt.match.{$this->matchId}")];
    }

    public function broadcastAs(): string
    {
        return 'GeoHuntStateChanged';
    }

    public function broadcastWith(): array
    {
        return ['matchId' => $this->matchId, 'stateVersion' => $this->stateVersion];
    }
}
