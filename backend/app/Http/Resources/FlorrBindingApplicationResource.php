<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FlorrBindingApplicationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'user' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'florrId' => $this->user->florr_id,
            ]),
            'screenshotMime' => $this->screenshot_mime,
            'screenshotSize' => $this->screenshot_size,
            'hasImage' => $this->screenshot_path !== null,
            'rejectionReason' => $this->rejection_reason,
            'submittedAt' => $this->created_at?->toISOString(),
            'reviewedAt' => $this->reviewed_at?->toISOString(),
            'resultUnread' => $this->reviewed_at !== null && $this->result_seen_at === null,
        ];
    }
}
