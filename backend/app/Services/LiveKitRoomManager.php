<?php

namespace App\Services;

use Agence104\LiveKit\RoomServiceClient;

class LiveKitRoomManager
{
    public function removeParticipant(int $teamId, int $userId): void
    {
        $this->client()?->removeParticipant($this->roomName($teamId), "user:{$userId}");
    }

    public function deleteRoom(int $teamId): void
    {
        $this->client()?->deleteRoom($this->roomName($teamId));
    }

    private function client(): ?RoomServiceClient
    {
        $url = (string) config('services.livekit.url');
        $key = (string) config('services.livekit.key');
        $secret = (string) config('services.livekit.secret');
        if ($url === '' || $key === '' || $secret === '') {
            return null;
        }

        $httpUrl = preg_replace('/^wss:/i', 'https:', preg_replace('/^ws:/i', 'http:', $url));

        return new RoomServiceClient($httpUrl, $key, $secret);
    }

    private function roomName(int $teamId): string
    {
        return "movers-team-{$teamId}";
    }
}
