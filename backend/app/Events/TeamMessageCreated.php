<?php

namespace App\Events;

use App\Models\TeamMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamMessageCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly TeamMessage $message) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("team.{$this->message->team_id}")];
    }

    public function broadcastAs(): string
    {
        return 'TeamMessageCreated';
    }

    public function broadcastWith(): array
    {
        $sender = $this->message->sender;

        return [
            'message' => [
                'id' => $this->message->id,
                'teamId' => $this->message->team_id,
                'sender' => [
                    'id' => $sender->id,
                    'florrId' => $sender->florr_id,
                    'level' => $sender->level,
                    'avatarUrl' => $sender->avatar_url,
                ],
                'body' => $this->message->body,
                'createdAt' => $this->message->created_at?->toISOString(),
            ],
        ];
    }
}
