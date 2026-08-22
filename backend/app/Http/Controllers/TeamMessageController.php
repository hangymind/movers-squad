<?php

namespace App\Http\Controllers;

use App\Events\TeamMessageCreated;
use App\Http\Resources\TeamMessageResource;
use App\Models\Team;
use App\Models\TeamMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class TeamMessageController extends Controller
{
    public function index(Request $request, int $teamId): JsonResponse
    {
        $team = $this->accessibleTeam($request, $teamId);
        $before = $request->integer('before') ?: null;
        $query = $team->messages()->with('sender:id,username,florr_id,level,avatar_url,florr_verified_at')->latest('id');
        if ($before !== null) {
            $query->where('id', '<', $before);
        }
        $messages = $query->limit(51)->get();
        $hasMore = $messages->count() > 50;
        $messages = $messages->take(50)->values();
        $cursor = DB::table('team_members')
            ->where('team_id', $team->id)
            ->where('user_id', $request->user()->id)
            ->value('last_read_message_id');
        $unreadCount = $team->messages()->where('id', '>', $cursor ?? 0)->where('user_id', '!=', $request->user()->id)->count();

        return response()->json([
            'data' => TeamMessageResource::collection($messages),
            'meta' => [
                'hasMore' => $hasMore,
                'nextBefore' => $hasMore ? $messages->last()?->id : null,
                'unreadCount' => $unreadCount,
            ],
        ]);
    }

    public function store(Request $request, int $teamId): JsonResponse
    {
        $team = $this->accessibleTeam($request, $teamId);
        $data = $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $body = trim($data['body']);
        abort_if($body === '', 422, '消息不能为空。');

        $message = $team->messages()->create(['user_id' => $request->user()->id, 'body' => $body]);
        $message->load('sender:id,username,florr_id,level,avatar_url,florr_verified_at');
        try {
            TeamMessageCreated::dispatch($message);
        } catch (Throwable $exception) {
            report($exception);
        }

        return (new TeamMessageResource($message))->response()->setStatusCode(201);
    }

    public function read(Request $request, int $teamId): JsonResponse
    {
        $team = $this->accessibleTeam($request, $teamId);
        $data = $request->validate(['lastMessageId' => ['required', 'integer', 'min:1']]);
        abort_unless(TeamMessage::query()->whereKey($data['lastMessageId'])->where('team_id', $team->id)->exists(), 422, '消息不属于该队伍。');

        DB::table('team_members')
            ->where('team_id', $team->id)
            ->where('user_id', $request->user()->id)
            ->update(['last_read_message_id' => DB::raw('CASE WHEN last_read_message_id IS NULL OR last_read_message_id < '.(int) $data['lastMessageId'].' THEN '.(int) $data['lastMessageId'].' ELSE last_read_message_id END')]);

        return response()->json(null, 204);
    }

    private function accessibleTeam(Request $request, int $teamId): Team
    {
        return Team::query()
            ->whereKey($teamId)
            ->whereNull('closed_at')
            ->whereNotNull('assembled_at')
            ->whereHas('members', fn ($query) => $query->whereKey($request->user()->id))
            ->firstOrFail();
    }
}
