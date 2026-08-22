<?php

namespace App\Events;

use App\Models\FlorrBindingApplication;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class FlorrBindingReviewed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public readonly FlorrBindingApplication $application) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("user.{$this->application->user_id}")];
    }

    public function broadcastAs(): string
    {
        return 'FlorrBindingReviewed';
    }

    public function broadcastWith(): array
    {
        return [
            'applicationId' => $this->application->id,
            'status' => $this->application->status,
            'rejectionReason' => $this->application->rejection_reason,
            'reviewedAt' => $this->application->reviewed_at?->toISOString(),
        ];
    }
}
