<?php

namespace App\Http\Controllers;

use App\Models\GeoHuntMatch;
use App\Services\GeoHuntRoomService;
use Illuminate\Http\JsonResponse;

class AdminGeoHuntRoomController extends Controller
{
    public function __construct(private readonly GeoHuntRoomService $rooms) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->rooms->adminRooms()]);
    }

    public function close(GeoHuntMatch $match): JsonResponse
    {
        $this->rooms->adminClose($match);

        return response()->json(null, 204);
    }
}
