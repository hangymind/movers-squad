<?php

namespace App\Http\Controllers;

use App\Services\GeoHuntRoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GeoHuntRoomController extends Controller
{
    public function __construct(private readonly GeoHuntRoomService $rooms) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['required', Rule::in(['private', 'admin_public'])],
            'maxPlayers' => ['required', 'integer', 'between:2,8'],
            'name' => ['nullable', 'string', 'max:80', 'not_regex:/^\s*$/u', Rule::requiredIf($request->input('mode') === 'admin_public')],
        ]);

        return response()->json(['data' => $this->rooms->create($request->user(), $data['mode'], (int) $data['maxPlayers'], $data['name'] ?? null)], 201);
    }

    public function join(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:6', 'regex:/^[A-Za-z0-9]+$/']]);

        return response()->json(['data' => $this->rooms->join($request->user(), $data['code'])]);
    }

    public function show(Request $request, string $code): JsonResponse
    {
        return response()->json(['data' => $this->rooms->state($request->user(), $code)]);
    }

    public function start(Request $request, string $code): JsonResponse
    {
        return response()->json(['data' => $this->rooms->start($request->user(), $code)]);
    }

    public function leave(Request $request, string $code): JsonResponse
    {
        $this->rooms->leave($request->user(), $code);

        return response()->json(null, 204);
    }
}
