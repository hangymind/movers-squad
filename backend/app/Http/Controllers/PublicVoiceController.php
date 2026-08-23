<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Services\PublicRoomVoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class PublicVoiceController extends Controller
{
    public function __construct(private readonly PublicRoomVoiceService $voice) {}

    public function token(Request $request): JsonResponse
    {
        try {
            return response()->json(['data' => $this->voice->credentials($request->user())]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => '语音服务尚未配置。'], 503);
        }
    }

    public function participants(Request $request): JsonResponse
    {
        try {
            $participants = $this->voice->participants();

            return response()->json([
                'data' => UserResource::collection($participants)->resolve($request),
                'meta' => ['count' => $participants->count(), 'available' => true],
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'data' => [],
                'meta' => ['count' => 0, 'available' => false],
            ]);
        }
    }
}
