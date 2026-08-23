<?php

namespace App\Events;

use App\Models\PublicMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PublicMessageCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly PublicMessage $message) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('public-room')];
    }

    public function broadcastAs(): string
    {
        return 'PublicMessageCreated';
    }

    public function broadcastWith(): array
    {
        $sender = $this->message->sender;

        return [
            'message' => [
                'id' => $this->message->id,
                'sender' => [
                    'id' => $sender->id,
                    'florrId' => $sender->florr_id,
                    'level' => $sender->level,
                    'avatarUrl' => $sender->avatar_url,
                    'isFlorrVerified' => $sender->florr_verified_at !== null,
                ],
                'body' => $this->message->body,
                'createdAt' => $this->message->created_at?->toISOString(),
            ],
        ];
    }
}
