<?php

namespace App\Http\Controllers;

use App\Services\GeoHuntGameService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeoHuntMatchController extends Controller
{
    public function __construct(private readonly GeoHuntGameService $game) {}

    public function show(Request $request, int $match): JsonResponse
    {
        return response()->json(['data' => $this->game->state($request->user(), $match)]);
    }

    public function heartbeat(Request $request, int $match): JsonResponse
    {
        return response()->json(['data' => $this->game->heartbeat($request->user(), $match)]);
    }

    public function guess(Request $request, int $match): JsonResponse
    {
        $data = $request->validate(['x' => ['required', 'numeric', 'between:0,1'], 'y' => ['required', 'numeric', 'between:0,1']]);

        return response()->json(['data' => $this->game->guess($request->user(), $match, (float) $data['x'], (float) $data['y'])]);
    }

    public function forfeit(Request $request, int $match): JsonResponse
    {
        return response()->json(['data' => $this->game->forfeit($request->user(), $match)]);
    }
}
