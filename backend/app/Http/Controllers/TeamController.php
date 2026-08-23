<?php

namespace App\Http\Controllers;

use App\Events\TeamAssembled;
use App\Events\TeamClosed;
use App\Events\TeamCreated;
use App\Events\TeamMemberJoined;
use App\Events\TeamMemberLeft;
use App\Http\Resources\TeamResource;
use App\Models\Team;
use App\Models\User;
use App\Services\LiveKitRoomManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;
use Throwable;

class TeamController extends Controller
{
    public function __construct(private readonly LiveKitRoomManager $liveKit) {}

    public function index(): JsonResponse
    {
        $teams = Team::query()
            ->whereNull('closed_at')
            ->whereNull('assembled_at')
            ->with(['owner:id,username,florr_id,level,avatar_url,florr_verified_at', 'members:id,username,florr_id,level,avatar_url,florr_verified_at'])
            ->withCount('members')
            ->latest()
            ->get();

        return response()->json([
            'data' => TeamResource::collection($teams)->resolve(),
        ]);
    }

    public function current(Request $request): JsonResponse
    {
        $team = Team::query()
            ->whereNull('closed_at')
            ->whereHas('members', fn ($query) => $query->whereKey($request->user()->id))
            ->with(['owner:id,username,florr_id,level,avatar_url,florr_verified_at', 'members:id,username,florr_id,level,avatar_url,florr_verified_at'])
            ->withCount('members')
            ->first();

        return response()->json(['data' => $team ? (new TeamResource($team))->resolve($request) : null]);
    }

    public function show(Request $request, int $teamId): TeamResource
    {
        $team = Team::query()->whereKey($teamId)->whereNull('closed_at')->firstOrFail();
        if ($team->assembled_at !== null) {
            abort_unless($team->members()->whereKey($request->user()->id)->exists(), 404);
        }

        return new TeamResource($this->loadTeam($team));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
            'minLevel' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'excludedFlorrIds' => ['nullable', 'array', 'max:50'],
            'excludedFlorrIds.*' => ['string', 'max:64', 'regex:/^[\pL\pN_.:-]+$/u'],
            'maxMembers' => ['nullable', 'integer', 'min:2', 'max:4'],
            'replaceCurrentTeam' => ['nullable', 'boolean'],
        ]);
        $excludedIds = collect($data['excludedFlorrIds'] ?? [])->map(fn (string $id) => trim($id))->filter()->unique()->values()->all();

        [$team, $replacedTeams, $leftTeams] = DB::transaction(function () use ($request, $data, $excludedIds): array {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            $activeTeams = Team::query()
                ->whereNull('closed_at')
                ->whereHas('members', fn ($query) => $query->whereKey($user->id))
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $replacedTeams = collect();
            $leftTeams = collect();
            if ($activeTeams->isNotEmpty()) {
                if (! ($data['replaceCurrentTeam'] ?? false)) {
                    throw new ConflictHttpException('你已经加入了一支未关闭的队伍。');
                }
                if ($activeTeams->contains(fn (Team $team): bool => $team->assembled_at !== null)) {
                    throw new ConflictHttpException('已经成队的队伍不能替换招募。');
                }
                foreach ($activeTeams as $activeTeam) {
                    if ($activeTeam->owner_id === $user->id) {
                        $activeTeam->update(['closed_at' => now()]);
                        $replacedTeams->push($activeTeam);
                    } else {
                        $activeTeam->members()->detach($user->id);
                        $leftTeams->push($activeTeam);
                    }
                }
            }

            $team = Team::create([
                'game_name' => 'Florr.io',
                'note' => isset($data['note']) && trim($data['note']) !== '' ? trim($data['note']) : null,
                'min_level' => $data['minLevel'] ?? 1,
                'excluded_florr_ids' => $excludedIds,
                'max_members' => $data['maxMembers'] ?? Team::MAX_MEMBERS,
                'owner_id' => $user->id,
            ]);
            $team->members()->attach($user->id, ['joined_at' => now()]);

            return [$team, $replacedTeams, $leftTeams];
        });

        foreach ($replacedTeams as $replacedTeam) {
            $this->broadcastSafely(new TeamClosed($replacedTeam));
        }
        foreach ($leftTeams as $leftTeam) {
            $this->broadcastSafely(new TeamMemberLeft($leftTeam, $request->user()));
        }
        $this->broadcastSafely(new TeamCreated($team));

        return (new TeamResource($this->loadTeam($team)))->response()->setStatusCode(201);
    }

    public function join(Request $request, int $teamId): TeamResource
    {
        /** @var User $user */
        $user = $request->user();

        [$team, $assembled] = DB::transaction(function () use ($teamId, $user): array {
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $this->ensureNoActiveTeam($user);
            $team = Team::query()->lockForUpdate()->findOrFail($teamId);

            if ($team->closed_at !== null) {
                throw new ConflictHttpException('该招募已关闭。');
            }

            if ($team->assembled_at !== null) {
                throw new ConflictHttpException('该队伍已经成队。');
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

            if ($team->members()->count() >= ($team->max_members ?? Team::MAX_MEMBERS)) {
                throw new ConflictHttpException('该队伍已满员。');
            }

            $team->members()->attach($user->id, ['joined_at' => now()]);
            $assembled = $team->members()->count() >= ($team->max_members ?? Team::MAX_MEMBERS);
            if ($assembled) {
                $team->update(['assembled_at' => now()]);
            }

            return [$team, $assembled];
        });

        try {
            TeamMemberJoined::dispatch($team, $user);
        } catch (Throwable $exception) {
            // Joining is committed independently; persisted state remains the source of truth.
            report($exception);
        }

        if ($assembled) {
            try {
                TeamAssembled::dispatch($team);
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return new TeamResource($this->loadTeam($team));
    }

    public function leave(Request $request, int $teamId): JsonResponse
    {
        $team = DB::transaction(function () use ($request, $teamId): Team {
            $team = Team::query()->lockForUpdate()->findOrFail($teamId);

            if ($team->owner_id === $request->user()->id) {
                throw new UnprocessableEntityHttpException('队长不能直接退出，请关闭招募。');
            }

            if (! $team->members()->whereKey($request->user()->id)->exists()) {
                throw new ConflictHttpException('你不在该队伍中。');
            }

            $team->members()->detach($request->user()->id);

            return $team;
        });

        try {
            TeamMemberLeft::dispatch($team, $request->user());
        } catch (Throwable $exception) {
            report($exception);
        }
        if ($team->assembled_at !== null) {
            try {
                $this->liveKit->removeParticipant($team->id, $request->user()->id);
            } catch (Throwable $exception) {
                report($exception);
            }
        }

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

        try {
            TeamClosed::dispatch($team);
        } catch (Throwable $exception) {
            report($exception);
        }
        if ($team->assembled_at !== null) {
            try {
                $this->liveKit->deleteRoom($team->id);
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return new TeamResource($this->loadTeam($team));
    }

    private function loadTeam(Team $team): Team
    {
        return $team->fresh()
            ->load(['owner:id,username,florr_id,level,avatar_url,florr_verified_at', 'members:id,username,florr_id,level,avatar_url,florr_verified_at'])
            ->loadCount('members');
    }

    private function ensureNoActiveTeam(User $user): void
    {
        $activeTeam = Team::query()
            ->whereNull('closed_at')
            ->whereHas('members', fn ($query) => $query->whereKey($user->id))
            ->first();

        if ($activeTeam !== null) {
            throw new ConflictHttpException('你已经加入了一支未关闭的队伍。');
        }
    }

    private function broadcastSafely(object $event): void
    {
        try {
            event($event);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
