<?php

namespace App\Services;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\RoomServiceClient;
use Agence104\LiveKit\VideoGrant;
use App\Models\User;
use Illuminate\Support\Collection;
use RuntimeException;

class PublicRoomVoiceService
{
    public const ROOM_NAME = 'movers-public';

    public function credentials(User $user): array
    {
        [$url, $key, $secret] = $this->configuration();
        $options = (new AccessTokenOptions)
            ->setIdentity("user:{$user->id}")
            ->setName($user->florr_id)
            ->setTtl(600);
        $grant = (new VideoGrant)
            ->setRoomJoin()
            ->setRoomName(self::ROOM_NAME)
            ->setCanPublish()
            ->setCanSubscribe()
            ->setCanPublishData(false)
            ->setCanPublishSources(['microphone']);
        $token = (new AccessToken($key, $secret))->init($options)->setGrant($grant)->toJwt();

        return ['serverUrl' => $url, 'token' => $token, 'roomName' => self::ROOM_NAME];
    }

    /** @return Collection<int, User> */
    public function participants(): Collection
    {
        [$url, $key, $secret] = $this->configuration();
        $httpUrl = preg_replace('/^wss:/i', 'https:', preg_replace('/^ws:/i', 'http:', $url));
        $client = new RoomServiceClient($httpUrl, $key, $secret);
        if ($client->listRooms([self::ROOM_NAME])->getRooms()->count() === 0) {
            return collect();
        }
        $response = $client->listParticipants(self::ROOM_NAME);
        $ids = [];
        foreach ($response->getParticipants() as $participant) {
            if (preg_match('/^user:(\d+)$/', $participant->getIdentity(), $matches) === 1) {
                $ids[] = (int) $matches[1];
            }
        }
        $users = User::query()->whereIn('id', array_values(array_unique($ids)))->get()->keyBy('id');

        return collect($ids)->unique()->map(fn (int $id) => $users->get($id))->filter()->values();
    }

    private function configuration(): array
    {
        $url = (string) config('services.livekit.url');
        $key = (string) config('services.livekit.key');
        $secret = (string) config('services.livekit.secret');
        if ($url === '' || $key === '' || $secret === '') {
            throw new RuntimeException('语音服务尚未配置。');
        }

        return [$url, $key, $secret];
    }
}
