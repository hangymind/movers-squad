<?php

namespace App\Http\Controllers;

use App\Events\TeamMemberJoined;
use App\Http\Resources\TeamResource;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Throwable;

class TeamController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $teams = Team::query()
            ->whereNull('closed_at')
            ->with(['owner:id,username,florr_id,level,avatar_url,florr_verified_at', 'members:id,username,florr_id,level,avatar_url,florr_verified_at'])
            ->withCount('members')
            ->latest()
            ->get();

        return TeamResource::collection($teams);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
            'minLevel' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'excludedFlorrIds' => ['nullable', 'array', 'max:50'],
            'excludedFlorrIds.*' => ['string', 'max:64', 'regex:/^[\pL\pN_.:-]+$/u'],
        ]);
        $excludedIds = collect($data['excludedFlorrIds'] ?? [])->map(fn (string $id) => trim($id))->filter()->unique()->values()->all();

        $team = DB::transaction(function () use ($request, $data, $excludedIds): Team {
            $team = Team::create([
                'game_name' => 'Florr.io',
                'note' => isset($data['note']) && trim($data['note']) !== '' ? trim($data['note']) : null,
                'min_level' => $data['minLevel'] ?? 1,
                'excluded_florr_ids' => $excludedIds,
                'owner_id' => $request->user()->id,
            ]);
            $team->members()->attach($request->user()->id, ['joined_at' => now()]);

            return $team;
        });

        return (new TeamResource($this->loadTeam($team)))->response()->setStatusCode(201);
    }

    public function join(Request $request, int $teamId): TeamResource
    {
        /** @var User $user */
        $user = $request->user();

        $team = DB::transaction(function () use ($teamId, $user): Team {
            $team = Team::query()->lockForUpdate()->findOrFail($teamId);

            if ($team->closed_at !== null) {
                throw new ConflictHttpException('该招募已关闭。');
            }

            if ($team->members()->whereKey($user->id)->exists()) {
                throw new ConflictHttpException('你已经在该队伍中。');
            }

            if ($user->level < $team->min_level) {
                throw new ConflictHttpException("该队伍要求等级 {$team->min_level} 以上。");
            }
            if (in_array($user->florr_id, $team->excluded_florr_ids ?? [], true)) {
                throw new ConflictHttpException('你的 Florr ID 不符合该队伍的加入条件。');
            }

            if ($team->members()->count() >= Team::MAX_MEMBERS) {
                throw new ConflictHttpException('该队伍已满员。');
            }

            $team->members()->attach($user->id, ['joined_at' => now()]);

            return $team;
        });

        try {
            TeamMemberJoined::dispatch($team, $user);
        } catch (Throwable $exception) {
            // Joining is committed independently; persisted state remains the source of truth.
            report($exception);
        }

        return new TeamResource($this->loadTeam($team));
    }

    public function leave(Request $request, int $teamId): JsonResponse
    {
        DB::transaction(function () use ($request, $teamId): void {
            $team = Team::query()->lockForUpdate()->findOrFail($teamId);

            if ($team->owner_id === $request->user()->id) {
                throw new UnprocessableEntityHttpException('队长不能直接退出，请关闭招募。');
            }

            if (! $team->members()->whereKey($request->user()->id)->exists()) {
                throw new ConflictHttpException('你不在该队伍中。');
            }

            $team->members()->detach($request->user()->id);
        });

        return response()->json(null, 204);
    }

    public function close(Request $request, int $teamId): TeamResource
    {
        $team = DB::transaction(function () use ($request, $teamId): Team {
            $team = Team::query()->lockForUpdate()->findOrFail($teamId);

            abort_unless($team->owner_id === $request->user()->id, 403, '只有队长可以关闭招募。');

            if ($team->closed_at !== null) {
                throw new ConflictHttpException('该招募已经关闭。');
            }

            $team->update(['closed_at' => now()]);

            return $team;
        });

        return new TeamResource($this->loadTeam($team));
    }

    private function loadTeam(Team $team): Team
    {
        return $team->fresh()
            ->load(['owner:id,username,florr_id,level,avatar_url,florr_verified_at', 'members:id,username,florr_id,level,avatar_url,florr_verified_at'])
            ->loadCount('members');
    }
}
