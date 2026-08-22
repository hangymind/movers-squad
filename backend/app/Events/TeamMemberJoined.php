<?php

namespace App\Events;

use App\Models\Team;
use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamMemberJoined implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly Team $team,
        public readonly User $joinedUser,
    ) {}

    public function broadcastOn(): array
    {
        // The recruitment hall is visible to all authenticated users. A shared
        // private channel lets every hall stay in sync without polling.
        return [new PrivateChannel('teams')];
    }

    public function broadcastAs(): string
    {
        return 'TeamMemberJoined';
    }

    public function broadcastWith(): array
    {
        return [
            'team' => [
                'id' => $this->team->id,
                'gameName' => $this->team->game_name,
            ],
            'joinedUser' => [
                'id' => $this->joinedUser->id,
                'florrId' => $this->joinedUser->florr_id,
                'avatarUrl' => $this->joinedUser->avatar_url,
            ],
            'joinedAt' => now()->toISOString(),
            // Include the post-join state so clients cannot miss the assembled
            // transition when their list subscription is refreshed.
            'isAssembled' => $this->team->assembled_at !== null,
        ];
    }
}
