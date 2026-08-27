<?php

namespace App\Services;

use App\Events\GeoHuntMatchFound;
use App\Events\GeoHuntStateChanged;
use App\Models\GeoHuntGuess;
use App\Models\GeoHuntMatch;
use App\Models\GeoHuntMatchPlayer;
use App\Models\GeoHuntProfile;
use App\Models\GeoHuntQueueEntry;
use App\Models\GeoHuntRound;
use App\Models\User;
use App\Rules\SafeAvatarUrl;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Throwable;

class GeoHuntGameService
{
    public function __construct(private readonly GeoHuntMapService $maps) {}

    public function lobby(User $user): array
    {
        GeoHuntQueueEntry::query()->where('heartbeat_at', '<', now()->subSeconds(30))->delete();
        $active = $this->activeMatchFor($user->id);
        if ($active) {
            $this->reconcile($active->id);
            $active = $this->activeMatchFor($user->id);
        }
        $profile = GeoHuntProfile::query()->firstOrCreate(['user_id' => $user->id]);
        $queued = GeoHuntQueueEntry::query()->whereKey($user->id)->exists();

        return [
            'profile' => $this->profilePayload($profile),
            'queued' => $queued,
            'queueCount' => GeoHuntQueueEntry::query()->count(),
            'currentMatchId' => $active && $active->status !== 'waiting' ? $active->id : null,
            'currentRoomCode' => $active?->status === 'waiting' ? $active->room_code : null,
            'publicRooms' => GeoHuntMatch::query()
                ->where('mode', 'admin_public')->where('status', 'waiting')
                ->with('host:id,florr_id')->withCount('players')->latest()->limit(30)->get()
                ->map(fn (GeoHuntMatch $room): array => $this->roomSummary($room))->values()->all(),
        ];
    }

    public function joinQueue(User $user): array
    {
        $found = null;
        $payload = DB::transaction(function () use ($user, &$found): array {
            GeoHuntQueueEntry::query()->where('heartbeat_at', '<', now()->subSeconds(30))->delete();
            $active = $this->activeMatchFor($user->id, true);
            if ($active) {
                return ['queued' => false, 'matchId' => $active->status === 'waiting' ? null : $active->id, 'roomCode' => $active->room_code];
            }

            $entry = GeoHuntQueueEntry::query()->lockForUpdate()->find($user->id);
            if ($entry) {
                $entry->update(['heartbeat_at' => now()]);
            } else {
                GeoHuntQueueEntry::query()->create(['user_id' => $user->id, 'joined_at' => now(), 'heartbeat_at' => now()]);
            }

            $opponent = GeoHuntQueueEntry::query()
                ->where('user_id', '!=', $user->id)
                ->where('heartbeat_at', '>=', now()->subSeconds(30))
                ->orderBy('joined_at')
                ->lockForUpdate()
                ->first();
            if (! $opponent) {
                return ['queued' => true, 'matchId' => null];
            }
            if ($this->activeMatchFor($opponent->user_id, true)) {
                $opponent->delete();
                return ['queued' => true, 'matchId' => null];
            }

            $match = GeoHuntMatch::query()->create(['status' => 'playing', 'round_number' => 1, 'state_version' => 1]);
            GeoHuntMatchPlayer::query()->create(['match_id' => $match->id, 'user_id' => $opponent->user_id, 'seat' => 1, 'hp' => config('geo_hunt.starting_hp'), 'heartbeat_at' => now()]);
            GeoHuntMatchPlayer::query()->create(['match_id' => $match->id, 'user_id' => $user->id, 'seat' => 2, 'hp' => config('geo_hunt.starting_hp'), 'heartbeat_at' => now()]);
            GeoHuntQueueEntry::query()->whereIn('user_id', [$user->id, $opponent->user_id])->delete();
            $this->startRoundLocked($match);
            $found = [$match->id, $user->id, $opponent->user_id];

            return ['queued' => false, 'matchId' => $match->id, 'roomCode' => null];
        });

        if ($found) {
            [$matchId, $first, $second] = $found;
            $this->broadcastSafely(new GeoHuntMatchFound($matchId, $first));
            $this->broadcastSafely(new GeoHuntMatchFound($matchId, $second));
        }

        return $payload;
    }

    public function leaveQueue(User $user): void
    {
        GeoHuntQueueEntry::query()->whereKey($user->id)->delete();
    }

    public function heartbeat(User $user, int $matchId): void
    {
        $this->authorizePlayer($user->id, $matchId);
        GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('user_id', $user->id)->update(['heartbeat_at' => now()]);
    }

    public function state(User $user, int $matchId, bool $shouldReconcile = true): array
    {
        $this->authorizePlayer($user->id, $matchId);
        if ($shouldReconcile) {
            $this->reconcile($matchId);
        }
        $match = GeoHuntMatch::query()->with(['players.user', 'rounds' => fn ($query) => $query->latest('number')->limit(1), 'rounds.guesses'])->findOrFail($matchId);
        $players = $match->players->sortBy('seat')->values();
        $round = $match->rounds->first();
        $selfPlayer = $players->firstWhere('user_id', $user->id);
        $grace = now()->subSeconds((int) config('geo_hunt.presence_grace_seconds'));
        $roundPayload = null;

        if ($round) {
            $roundPayload = [
                'id' => $round->id,
                'number' => $round->number,
                'mapKey' => $round->map_key,
                'multiplier' => $round->multiplier,
                'deadlineAt' => $round->deadline_at->toISOString(),
                'firstGuessAt' => $round->first_guess_at?->toISOString(),
                'revealUntil' => $round->reveal_until?->toISOString(),
                'submitted' => $round->guesses->contains('user_id', $user->id),
                'submittedCount' => $round->guesses->count(),
                'requiredGuesses' => $players->where('hp', '>', 0)->whereNull('eliminated_at')->count(),
                'snippet' => null,
                'result' => $round->resolved_at ? [
                    'target' => ['x' => $round->target_x, 'y' => $round->target_y],
                    'damage' => $round->damage,
                    'damagedUserId' => $round->damaged_user_id,
                    'guesses' => $round->guesses->map(fn (GeoHuntGuess $guess): array => [
                        'userId' => $guess->user_id,
                        'x' => $guess->x,
                        'y' => $guess->y,
                        'distanceTiles' => $guess->distance_tiles,
                        'score' => $guess->score,
                        'timedOut' => $guess->timed_out,
                        'damageTaken' => $guess->damage_taken,
                        'hpAfter' => $guess->hp_after,
                    ])->values()->all(),
                ] : null,
            ];
        }

        return [
            'id' => $match->id,
            'status' => $match->status,
            'mode' => $match->mode,
            'roomCode' => $match->room_code,
            'roomName' => $match->room_name,
            'maxPlayers' => $match->max_players,
            'hostId' => $match->host_id,
            'stateVersion' => $match->state_version,
            'self' => $this->playerPayload($selfPlayer, $grace),
            'players' => $players->map(fn (GeoHuntMatchPlayer $player): array => $this->playerPayload($player, $grace))->all(),
            'opponent' => ($opponent = $players->first(fn (GeoHuntMatchPlayer $player): bool => $player->user_id !== $user->id)) ? $this->playerPayload($opponent, $grace) : null,
            'round' => $roundPayload,
            'winnerId' => $match->winner_id,
            'endedReason' => $match->ended_reason,
            'finishedAt' => $match->finished_at?->toISOString(),
            'profile' => $this->profilePayload(GeoHuntProfile::query()->firstOrCreate(['user_id' => $user->id])),
        ];
    }

    public function guess(User $user, int $matchId, float $x, float $y): array
    {
        if ($x < 0 || $x > 1 || $y < 0 || $y > 1) {
            throw new ConflictHttpException('落点必须位于地图范围内。');
        }
        $version = DB::transaction(function () use ($user, $matchId, $x, $y): int {
            $match = $this->lockedMatchForPlayer($user->id, $matchId);
            $this->reconcileLocked($match);
            if ($match->status !== 'playing') {
                throw new ConflictHttpException('当前回合不能提交落点。');
            }
            $self = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('user_id', $user->id)->lockForUpdate()->firstOrFail();
            if ($self->hp === 0 || $self->eliminated_at !== null) {
                throw new ConflictHttpException('你已被淘汰，不能继续提交。');
            }
            $round = GeoHuntRound::query()->where('match_id', $match->id)->where('number', $match->round_number)->lockForUpdate()->firstOrFail();
            $existing = GeoHuntGuess::query()->where('round_id', $round->id)->where('user_id', $user->id)->first();
            if ($existing) {
                return $match->state_version;
            }
            if ($round->deadline_at->isPast()) {
                $this->resolveTimedOutRoundLocked($match, $round);
                return $match->state_version;
            }

            GeoHuntGuess::query()->create(['round_id' => $round->id, 'user_id' => $user->id, 'x' => $x, 'y' => $y, 'submitted_at' => now()]);
            if (! $round->first_guess_at) {
                $shortDeadline = now()->addSeconds((int) config('geo_hunt.guess_countdown_seconds'));
                $round->update(['first_guess_at' => now(), 'deadline_at' => $shortDeadline->lt($round->deadline_at) ? $shortDeadline : $round->deadline_at]);
            }
            $activeIds = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->pluck('user_id');
            if (GeoHuntGuess::query()->where('round_id', $round->id)->whereIn('user_id', $activeIds)->count() >= $activeIds->count()) {
                $this->resolveRoundLocked($match, $round->fresh());
            } else {
                $match->increment('state_version');
                $match->refresh();
            }

            return $match->state_version;
        });

        $this->broadcastState($matchId, $version);

        return $this->state($user, $matchId, false);
    }

    public function forfeit(User $user, int $matchId): array
    {
        $version = DB::transaction(function () use ($user, $matchId): int {
            $match = $this->lockedMatchForPlayer($user->id, $matchId);
            if ($match->status === 'finished') {
                return $match->state_version;
            }
            $loser = GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('user_id', $user->id)->lockForUpdate()->firstOrFail();
            if ($loser->eliminated_at !== null) {
                return $match->state_version;
            }
            $aliveCount = GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('hp', '>', 0)->whereNull('eliminated_at')->count();
            $loser->update(['hp' => 0, 'forfeited_at' => now(), 'eliminated_at' => now(), 'placement' => $aliveCount]);
            $this->finishIfOneLocked($match, 'forfeit');
            if ($match->status !== 'finished') {
                $this->resolveIfAllActiveSubmittedLocked($match);
                if ($match->status === 'playing') {
                    $match->update(['state_version' => $match->state_version + 1]);
                }
            }

            return $match->state_version;
        });
        $this->broadcastState($matchId, $version);

        return $this->state($user, $matchId, false);
    }

    public function mapDocument(string $key): array
    {
        return $this->maps->clientDocument($key);
    }

    public function roundSnippet(User $user, int $matchId, int $roundId): array
    {
        $this->authorizePlayer($user->id, $matchId);
        $round = GeoHuntRound::query()->whereKey($roundId)->where('match_id', $matchId)->firstOrFail();

        return $this->maps->cachedSnippet($round->map_key, $round->crop_x, $round->crop_y, $round->crop_size);
    }

    public function beginCustomMatch(int $matchId, int $hostId): int
    {
        $version = DB::transaction(function () use ($matchId, $hostId): int {
            $match = GeoHuntMatch::query()->whereKey($matchId)->lockForUpdate()->firstOrFail();
            if ($match->status !== 'waiting' || $match->host_id !== $hostId) {
                throw new ConflictHttpException('当前房间不能开始。');
            }
            $players = GeoHuntMatchPlayer::query()->where('match_id', $matchId)->lockForUpdate()->get();
            if ($players->count() < 2) {
                throw new ConflictHttpException('至少需要 2 名玩家才能开始。');
            }
            GeoHuntQueueEntry::query()->whereIn('user_id', $players->pluck('user_id'))->delete();
            GeoHuntMatchPlayer::query()->where('match_id', $matchId)->update(['heartbeat_at' => now()]);
            $match->update(['status' => 'playing', 'round_number' => 1, 'state_version' => $match->state_version + 1]);
            $this->startRoundLocked($match);

            return $match->state_version;
        });
        $this->broadcastState($matchId, $version);

        return $version;
    }

    public function closeCustomMatch(int $matchId, string $reason = 'admin_closed'): void
    {
        $version = DB::transaction(function () use ($matchId, $reason): int {
            $match = GeoHuntMatch::query()->whereKey($matchId)->lockForUpdate()->firstOrFail();
            if ($match->mode === 'ranked_1v1' || $match->status === 'finished') {
                return $match->state_version;
            }
            $match->update(['status' => 'finished', 'winner_id' => null, 'ended_reason' => $reason, 'finished_at' => now(), 'closed_at' => now(), 'state_version' => $match->state_version + 1]);

            return $match->state_version;
        });
        $this->broadcastState($matchId, $version);
    }

    public function reconcile(int $matchId): void
    {
        [$before, $after] = DB::transaction(function () use ($matchId): array {
            $match = GeoHuntMatch::query()->lockForUpdate()->findOrFail($matchId);
            $before = $match->state_version;
            $this->reconcileLocked($match);

            return [$before, $match->state_version];
        });
        if ($before !== $after) {
            $this->broadcastState($matchId, $after);
        }
    }

    private function reconcileLocked(GeoHuntMatch $match): void
    {
        if (in_array($match->status, ['waiting', 'finished'], true)) {
            return;
        }
        $players = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->lockForUpdate()->get();
        $staleBefore = now()->subSeconds((int) config('geo_hunt.presence_grace_seconds'));
        $alive = $players->filter(fn (GeoHuntMatchPlayer $player): bool => $player->hp > 0 && $player->eliminated_at === null);
        $stale = $alive->filter(fn (GeoHuntMatchPlayer $player): bool => $player->heartbeat_at->lt($staleBefore));
        $stalePlacement = $alive->count() - $stale->count() + 1;
        foreach ($stale as $loser) {
            $loser->update(['hp' => 0, 'eliminated_at' => now(), 'placement' => $stalePlacement]);
        }
        if ($stale->isNotEmpty() && $this->finishIfOneLocked($match, 'disconnect')) {
            return;
        }
        if ($stale->isNotEmpty()) {
            $match->update(['state_version' => $match->state_version + 1]);
        }

        $round = GeoHuntRound::query()->where('match_id', $match->id)->where('number', $match->round_number)->lockForUpdate()->first();
        if (! $round) {
            $this->startRoundLocked($match);
            return;
        }
        if ($match->status === 'playing' && $round->deadline_at->isPast()) {
            $this->resolveTimedOutRoundLocked($match, $round);
            return;
        }
        if ($match->status === 'playing' && $this->resolveIfAllActiveSubmittedLocked($match, $round)) {
            return;
        }
        if ($match->status === 'reveal' && $round->reveal_until?->isPast()) {
            $match->update(['status' => 'playing', 'round_number' => $match->round_number + 1, 'state_version' => $match->state_version + 1]);
            $this->startRoundLocked($match);
        }
    }

    private function resolveTimedOutRoundLocked(GeoHuntMatch $match, GeoHuntRound $round): void
    {
        $players = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->lockForUpdate()->get();
        foreach ($players as $player) {
            GeoHuntGuess::query()->firstOrCreate(
                ['round_id' => $round->id, 'user_id' => $player->user_id],
                ['timed_out' => true, 'score' => 0, 'submitted_at' => $round->deadline_at],
            );
        }
        $this->resolveRoundLocked($match, $round);
    }

    private function resolveIfAllActiveSubmittedLocked(GeoHuntMatch $match, ?GeoHuntRound $round = null): bool
    {
        $round ??= GeoHuntRound::query()->where('match_id', $match->id)->where('number', $match->round_number)->lockForUpdate()->first();
        if (! $round || $round->resolved_at) {
            return false;
        }
        $activeIds = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->pluck('user_id');
        if ($activeIds->isEmpty() || GeoHuntGuess::query()->where('round_id', $round->id)->whereIn('user_id', $activeIds)->count() < $activeIds->count()) {
            return false;
        }
        $this->resolveRoundLocked($match, $round);

        return true;
    }

    private function resolveRoundLocked(GeoHuntMatch $match, GeoHuntRound $round): void
    {
        if ($round->resolved_at) {
            return;
        }
        $map = $this->maps->load($round->map_key);
        $diagonal = sqrt(($map['width'] ** 2) + ($map['height'] ** 2));
        $activeIds = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->pluck('user_id');
        $guesses = GeoHuntGuess::query()->where('round_id', $round->id)->whereIn('user_id', $activeIds)->lockForUpdate()->get();
        foreach ($guesses as $guess) {
            if ($guess->timed_out || $guess->x === null || $guess->y === null) {
                $guess->update(['score' => 0]);
                continue;
            }
            $dx = ($guess->x - $round->target_x) * $map['width'];
            $dy = ($guess->y - $round->target_y) * $map['height'];
            $distance = sqrt(($dx ** 2) + ($dy ** 2));
            $normalized = min(1, $distance / max(1, $diagonal));
            $guess->update(['distance_tiles' => $distance, 'score' => (int) round(5000 * exp(-5 * $normalized))]);
        }

        $guesses = $guesses->fresh()->sortByDesc('score')->values();
        $topScore = (int) ($guesses->first()?->score ?? 0);
        $players = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->lockForUpdate()->get()->keyBy('user_id');
        $maxDamage = 0;
        $singleDamagedUserId = null;
        foreach ($guesses as $guess) {
            $player = $players->get($guess->user_id);
            if (! $player) {
                continue;
            }
            $damage = max(0, (int) round(($topScore - $guess->score) * $round->multiplier));
            $hpAfter = max(0, $player->hp - $damage);
            $guess->update(['damage_taken' => $damage, 'hp_after' => $hpAfter]);
            $player->update(['hp' => $hpAfter]);
            $maxDamage = max($maxDamage, $damage);
            if ($damage > 0) {
                $singleDamagedUserId = $singleDamagedUserId === null ? $player->user_id : false;
            }
        }

        $aliveAfter = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->count();
        GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', 0)->whereNull('eliminated_at')
            ->update(['eliminated_at' => now(), 'placement' => $aliveAfter + 1]);
        $round->update([
            'resolved_at' => now(),
            'damage' => $maxDamage,
            'damaged_user_id' => is_int($singleDamagedUserId) ? $singleDamagedUserId : null,
            'reveal_until' => now()->addSeconds((int) config('geo_hunt.reveal_seconds')),
        ]);
        if ($this->finishIfOneLocked($match, 'knockout')) {
            return;
        }
        $match->update(['status' => 'reveal', 'state_version' => $match->state_version + 1]);
    }

    private function startRoundLocked(GeoHuntMatch $match): void
    {
        $used = GeoHuntRound::query()->where('match_id', $match->id)->pluck('map_key')->all();
        $all = $this->maps->keys();
        $available = array_values(array_diff($all, $used));
        if ($available === []) {
            $available = $all;
        }
        $key = $available[random_int(0, count($available) - 1)];
        $map = $this->maps->load($key);
        $target = $this->maps->randomTarget($map);
        $number = $match->round_number;
        $multiplier = $number < 5 ? 1.0 : 1.5 + (($number - 5) * 0.5);
        GeoHuntRound::query()->create([
            'match_id' => $match->id,
            'number' => $number,
            'map_key' => $key,
            'target_x' => $target['targetX'],
            'target_y' => $target['targetY'],
            'crop_x' => $target['x'],
            'crop_y' => $target['y'],
            'crop_size' => $target['size'],
            'multiplier' => $multiplier,
            'started_at' => now(),
            'deadline_at' => now()->addSeconds((int) config('geo_hunt.round_seconds')),
        ]);
    }

    private function finishIfOneLocked(GeoHuntMatch $match, string $reason): bool
    {
        $alive = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('hp', '>', 0)->whereNull('eliminated_at')->lockForUpdate()->get();
        if ($alive->count() > 1) {
            return false;
        }
        $winner = $alive->first();
        if ($winner) {
            $winner->update(['placement' => 1]);
        }
        $this->finishLocked($match, $winner?->user_id, $winner ? $reason : 'abandoned');

        return true;
    }

    private function finishLocked(GeoHuntMatch $match, ?int $winnerId, string $reason): void
    {
        if ($match->status === 'finished') {
            return;
        }
        $match->update(['status' => 'finished', 'winner_id' => $winnerId, 'ended_reason' => $reason, 'finished_at' => now(), 'state_version' => $match->state_version + 1]);
        if ($match->mode === 'ranked_1v1' && $winnerId !== null) {
            $this->awardExperienceLocked($match->fresh());
        }
    }

    private function awardExperienceLocked(GeoHuntMatch $match): void
    {
        if ($match->xp_awarded_at) {
            return;
        }
        $players = GeoHuntMatchPlayer::query()->where('match_id', $match->id)->lockForUpdate()->get();
        foreach ($players as $player) {
            $won = $player->user_id === $match->winner_id;
            $xp = $won ? 100 : (in_array($match->ended_reason, ['forfeit', 'disconnect'], true) ? 0 : 40);
            $profile = GeoHuntProfile::query()->lockForUpdate()->firstOrCreate(['user_id' => $player->user_id]);
            $experience = $profile->experience + $xp;
            $level = $this->levelForExperience($experience);
            $profile->update([
                'experience' => $experience,
                'level' => $level,
                'wins' => $profile->wins + ($won ? 1 : 0),
                'losses' => $profile->losses + ($won ? 0 : 1),
                'matches_played' => $profile->matches_played + 1,
            ]);
            $player->update(['xp_awarded' => $xp]);
        }
        $match->update(['xp_awarded_at' => now()]);
    }

    private function activeMatchFor(int $userId, bool $lock = false): ?GeoHuntMatch
    {
        $query = GeoHuntMatch::query()->whereIn('status', ['waiting', 'playing', 'reveal'])->whereHas('players', fn ($players) => $players->where('user_id', $userId));
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->latest('id')->first();
    }

    private function lockedMatchForPlayer(int $userId, int $matchId): GeoHuntMatch
    {
        return GeoHuntMatch::query()->whereKey($matchId)->whereHas('players', fn ($players) => $players->where('user_id', $userId))->lockForUpdate()->firstOrFail();
    }

    private function authorizePlayer(int $userId, int $matchId): void
    {
        abort_unless(GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('user_id', $userId)->exists(), 404);
    }

    private function profilePayload(GeoHuntProfile $profile): array
    {
        $currentFloor = 50 * ($profile->level - 1) * $profile->level;
        $nextThreshold = 50 * $profile->level * ($profile->level + 1);

        return [
            'level' => $profile->level,
            'experience' => $profile->experience,
            'experienceIntoLevel' => $profile->experience - $currentFloor,
            'experienceForNextLevel' => $nextThreshold - $currentFloor,
            'wins' => $profile->wins,
            'losses' => $profile->losses,
            'matchesPlayed' => $profile->matches_played,
        ];
    }

    private function playerPayload(GeoHuntMatchPlayer $player, $grace): array
    {
        return [
            'user' => [
                'id' => $player->user->id,
                'florrId' => $player->user->florr_id,
                'level' => $player->user->level,
                'avatarUrl' => SafeAvatarUrl::isValid($player->user->avatar_url) ? $player->user->avatar_url : null,
                'isFlorrVerified' => $player->user->florr_verified_at !== null,
            ],
            'hp' => $player->hp,
            'connected' => $player->heartbeat_at->gte($grace),
            'xpAwarded' => $player->xp_awarded,
            'seat' => $player->seat,
            'eliminated' => $player->eliminated_at !== null || $player->hp === 0,
            'placement' => $player->placement,
        ];
    }

    public function roomSummary(GeoHuntMatch $room): array
    {
        return [
            'id' => $room->id,
            'code' => $room->room_code,
            'name' => $room->room_name,
            'mode' => $room->mode,
            'host' => $room->relationLoaded('host') && $room->host ? ['id' => $room->host->id, 'florrId' => $room->host->florr_id] : null,
            'playerCount' => isset($room->players_count) ? $room->players_count : $room->players()->count(),
            'maxPlayers' => $room->max_players,
            'status' => $room->status,
            'createdAt' => $room->created_at?->toISOString(),
        ];
    }

    private function levelForExperience(int $experience): int
    {
        $level = 1;
        while ($experience >= 50 * $level * ($level + 1)) {
            $level++;
        }

        return $level;
    }

    private function broadcastState(int $matchId, int $version): void
    {
        $this->broadcastSafely(new GeoHuntStateChanged($matchId, $version));
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
