<?php

namespace App\Http\Controllers;

use App\Services\GeoHuntGameService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeoHuntController extends Controller
{
    public function __construct(private readonly GeoHuntGameService $game) {}

    public function lobby(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->game->lobby($request->user())]);
    }

    public function queue(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->game->joinQueue($request->user())]);
    }

    public function leaveQueue(Request $request): JsonResponse
    {
        $this->game->leaveQueue($request->user());

        return response()->json(null, 204);
    }

    public function map(Request $request, string $mapKey)
    {
        $document = $this->game->mapDocument($mapKey);
        $response = response($document['json'], 200, ['Content-Type' => 'application/json']);
        $response->setEtag($document['etag'])->setPrivate()->setMaxAge(86400);
        $response->isNotModified($request);

        return $response;
    }
}
