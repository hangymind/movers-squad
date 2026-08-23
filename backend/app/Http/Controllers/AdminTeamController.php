<?php

namespace App\Http\Controllers;

use App\Events\TeamClosed;
use App\Http\Resources\TeamAdminResource;
use App\Models\Team;
use App\Services\LiveKitRoomManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Throwable;

class AdminTeamController extends Controller
{
    public function __construct(private readonly LiveKitRoomManager $liveKit) {}

    public function index(): AnonymousResourceCollection
    {
        $teams = Team::query()
            ->with([
                'owner:id,username,florr_id,level,avatar_url,florr_verified_at',
                'members:id,username,florr_id,level,avatar_url,florr_verified_at',
            ])
            ->withCount('members')
            ->latest()
            ->limit(200)
            ->get();

        return TeamAdminResource::collection($teams);
    }

    public function close(Team $team): TeamAdminResource
    {
        if ($team->closed_at === null) {
            $team->update(['closed_at' => now()]);
            try {
                event(new TeamClosed($team));
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        if ($team->assembled_at !== null) {
            try {
                $this->liveKit->deleteRoom($team->id);
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return new TeamAdminResource($team->fresh()->load(['owner', 'members'])->loadCount('members'));
    }

    public function destroy(Team $team): JsonResponse
    {
        $teamId = $team->id;
        $wasOpen = $team->closed_at === null;
        $team->update(['closed_at' => now()]);
        if ($wasOpen) {
            try {
                event(new TeamClosed($team));
            } catch (Throwable $exception) {
                report($exception);
            }
        }
        try {
            $this->liveKit->deleteRoom($teamId);
        } catch (Throwable $exception) {
            report($exception);
        }
        $team->delete();

        return response()->json(null, 204);
    }
}
