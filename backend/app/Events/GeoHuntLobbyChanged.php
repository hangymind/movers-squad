<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GeoHuntLobbyChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly int $roomId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('geo-hunt.lobby')];
    }

    public function broadcastAs(): string
    {
        return 'GeoHuntLobbyChanged';
    }

    public function broadcastWith(): array
    {
        return ['roomId' => $this->roomId];
    }
}
