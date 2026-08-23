<?php

namespace App\Http\Controllers;

use App\Events\PublicMessageCreated;
use App\Http\Resources\PublicMessageResource;
use App\Models\PublicMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class PublicMessageController extends Controller
{
    private const PAGE_SIZE = 50;

    private const RETENTION_LIMIT = 500;

    public function index(Request $request): JsonResponse
    {
        $before = $request->integer('before') ?: null;
        $query = PublicMessage::query()
            ->with('sender:id,username,florr_id,level,avatar_url,florr_verified_at')
            ->latest('id');
        if ($before !== null) {
            $query->where('id', '<', $before);
        }

        $messages = $query->limit(self::PAGE_SIZE + 1)->get();
        $hasMore = $messages->count() > self::PAGE_SIZE;
        $messages = $messages->take(self::PAGE_SIZE)->values();

        return response()->json([
            'data' => PublicMessageResource::collection($messages),
            'meta' => [
                'hasMore' => $hasMore,
                'nextBefore' => $hasMore ? $messages->last()?->id : null,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $body = trim($data['body']);
        abort_if($body === '', 422, '消息不能为空。');

        $message = DB::transaction(function () use ($request, $body): PublicMessage {
            $message = PublicMessage::query()->create([
                'user_id' => $request->user()->id,
                'body' => $body,
            ]);
            $cutoffId = PublicMessage::query()->latest('id')->skip(self::RETENTION_LIMIT)->value('id');
            if ($cutoffId !== null) {
                PublicMessage::query()->where('id', '<=', $cutoffId)->delete();
            }

            return $message;
        });
        $message->load('sender:id,username,florr_id,level,avatar_url,florr_verified_at');
        try {
            PublicMessageCreated::dispatch($message);
        } catch (Throwable $exception) {
            report($exception);
        }

        return (new PublicMessageResource($message))->response()->setStatusCode(201);
    }
}
