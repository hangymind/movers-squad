<?php

namespace App\Http\Controllers;

use Agence104\LiveKit\AccessToken;
use Agence104\LiveKit\AccessTokenOptions;
use Agence104\LiveKit\VideoGrant;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TeamVoiceController extends Controller
{
    public function token(Request $request, int $teamId): JsonResponse
    {
        $team = Team::query()
            ->whereKey($teamId)
            ->whereNull('closed_at')
            ->whereNotNull('assembled_at')
            ->whereHas('members', fn ($query) => $query->whereKey($request->user()->id))
            ->firstOrFail();

        $url = (string) config('services.livekit.url');
        $key = (string) config('services.livekit.key');
        $secret = (string) config('services.livekit.secret');
        abort_if($url === '' || $key === '' || $secret === '', 503, '语音服务尚未配置。');

        $roomName = "movers-team-{$team->id}";
        $options = (new AccessTokenOptions())
            ->setIdentity("user:{$request->user()->id}")
            ->setName($request->user()->florr_id)
            ->setTtl(600);
        $grant = (new VideoGrant())
            ->setRoomJoin()
            ->setRoomName($roomName)
            ->setCanPublish()
            ->setCanSubscribe()
            ->setCanPublishData(false)
            ->setCanPublishSources(['microphone']);
        $token = (new AccessToken($key, $secret))->init($options)->setGrant($grant)->toJwt();

        return response()->json(['data' => ['serverUrl' => $url, 'token' => $token, 'roomName' => $roomName]]);
    }
}
