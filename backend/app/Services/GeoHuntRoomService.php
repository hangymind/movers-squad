<?php

namespace App\Services;

use App\Events\GeoHuntLobbyChanged;
use App\Events\GeoHuntStateChanged;
use App\Models\GeoHuntMatch;
use App\Models\GeoHuntMatchPlayer;
use App\Models\GeoHuntQueueEntry;
use App\Models\User;
use App\Rules\SafeAvatarUrl;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Throwable;

class GeoHuntRoomService
{
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(private readonly GeoHuntGameService $game) {}

    public function create(User $user, string $mode, int $maxPlayers, ?string $name): array
    {
        if ($mode === 'admin_public' && ! $user->is_admin) {
            abort(403, '仅管理员可以创建公开多人房。');
        }
        $room = DB::transaction(function () use ($user, $mode, $maxPlayers, $name): GeoHuntMatch {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->ensureAvailable($user->id);
            GeoHuntQueueEntry::query()->whereKey($user->id)->delete();
            $room = GeoHuntMatch::query()->create([
                'status' => 'waiting',
                'mode' => $mode,
                'host_id' => $user->id,
                'room_code' => $this->uniqueCode(),
                'room_name' => $mode === 'admin_public' ? trim((string) $name) : null,
                'max_players' => $maxPlayers,
                'state_version' => 1,
            ]);
            GeoHuntMatchPlayer::query()->create([
                'match_id' => $room->id, 'user_id' => $user->id, 'seat' => 1,
                'hp' => config('geo_hunt.starting_hp'), 'heartbeat_at' => now(),
            ]);

            return $room;
        });
        $this->broadcastRoom($room);

        return $this->state($user, $room->room_code);
    }

    public function join(User $user, string $code): array
    {
        $room = DB::transaction(function () use ($user, $code): GeoHuntMatch {
            User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $room = GeoHuntMatch::query()->where('room_code', $this->normalizeCode($code))->lockForUpdate()->firstOrFail();
            $existing = GeoHuntMatchPlayer::query()->where('match_id', $room->id)->where('user_id', $user->id)->first();
            if ($existing) {
                return $room;
            }
            if ($room->status !== 'waiting') {
                throw new ConflictHttpException('房间已开始或已关闭。');
            }
            $this->ensureAvailable($user->id);
            $players = GeoHuntMatchPlayer::query()->where('match_id', $room->id)->lockForUpdate()->get();
            if ($players->count() >= $room->max_players) {
                throw new ConflictHttpException('房间人数已满。');
            }
            GeoHuntQueueEntry::query()->whereKey($user->id)->delete();
            GeoHuntMatchPlayer::query()->create([
                'match_id' => $room->id, 'user_id' => $user->id,
                'seat' => ((int) $players->max('seat')) + 1,
                'hp' => config('geo_hunt.starting_hp'), 'heartbeat_at' => now(),
            ]);
            $room->update(['state_version' => $room->state_version + 1]);

            return $room;
        });
        $this->broadcastRoom($room);

        return $this->state($user, $room->room_code);
    }

    public function state(User $user, string $code): array
    {
        $room = GeoHuntMatch::query()->where('room_code', $this->normalizeCode($code))->with(['host', 'players.user'])->firstOrFail();
        abort_unless($room->players->contains('user_id', $user->id), 404);
        GeoHuntMatchPlayer::query()->where('match_id', $room->id)->where('user_id', $user->id)->update(['heartbeat_at' => now()]);

        return $this->payload($room);
    }

    public function start(User $user, string $code): array
    {
        $room = GeoHuntMatch::query()->where('room_code', $this->normalizeCode($code))->firstOrFail();
        abort_unless($room->host_id === $user->id, 403, '只有房主可以开始。');
        $this->game->beginCustomMatch($room->id, $user->id);
        $this->broadcastLobby($room);

        return ['matchId' => $room->id];
    }

    public function leave(User $user, string $code): void
    {
        $room = DB::transaction(function () use ($user, $code): GeoHuntMatch {
            $room = GeoHuntMatch::query()->where('room_code', $this->normalizeCode($code))->lockForUpdate()->firstOrFail();
            if ($room->status !== 'waiting') {
                throw new ConflictHttpException('对局开始后请使用退出对局。');
            }
            $player = GeoHuntMatchPlayer::query()->where('match_id', $room->id)->where('user_id', $user->id)->lockForUpdate()->firstOrFail();
            if ($room->host_id === $user->id) {
                $room->update(['status' => 'finished', 'ended_reason' => 'host_closed', 'finished_at' => now(), 'closed_at' => now(), 'state_version' => $room->state_version + 1]);
            } else {
                $player->delete();
                $room->update(['state_version' => $room->state_version + 1]);
            }

            return $room;
        });
        $this->broadcastRoom($room);
    }

    public function adminRooms(): array
    {
        return GeoHuntMatch::query()->whereIn('mode', ['private', 'admin_public'])
            ->with('host:id,florr_id')->withCount('players')->latest()->limit(200)->get()
            ->map(fn (GeoHuntMatch $room): array => $this->game->roomSummary($room))->all();
    }

    public function adminClose(GeoHuntMatch $room): void
    {
        abort_if($room->mode === 'ranked_1v1', 404);
        $this->game->closeCustomMatch($room->id);
        $this->broadcastLobby($room);
    }

    private function payload(GeoHuntMatch $room): array
    {
        return [
            ...$this->game->roomSummary($room),
            'stateVersion' => $room->state_version,
            'hostId' => $room->host_id,
            'players' => $room->players->sortBy('seat')->map(fn (GeoHuntMatchPlayer $player): array => [
                'user' => [
                    'id' => $player->user->id, 'florrId' => $player->user->florr_id,
                    'level' => $player->user->level,
                    'avatarUrl' => SafeAvatarUrl::isValid($player->user->avatar_url) ? $player->user->avatar_url : null,
                    'isFlorrVerified' => $player->user->florr_verified_at !== null,
                ],
                'seat' => $player->seat,
            ])->values()->all(),
        ];
    }

    private function ensureAvailable(int $userId): void
    {
        $active = GeoHuntMatch::query()->whereIn('status', ['waiting', 'playing', 'reveal'])
            ->whereHas('players', fn ($players) => $players->where('user_id', $userId))->exists();
        if ($active) {
            throw new ConflictHttpException('你已经在排队或另一个房间中。');
        }
    }

    private function uniqueCode(): string
    {
        do {
            $code = '';
            for ($index = 0; $index < 6; $index++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (GeoHuntMatch::query()->where('room_code', $code)->exists());

        return $code;
    }

    private function normalizeCode(string $code): string
    {
        return strtoupper(trim($code));
    }

    private function broadcastRoom(GeoHuntMatch $room): void
    {
        $this->broadcastSafely(new GeoHuntStateChanged($room->id, $room->state_version));
        $this->broadcastLobby($room);
    }

    private function broadcastLobby(GeoHuntMatch $room): void
    {
        if ($room->mode === 'admin_public') {
            $this->broadcastSafely(new GeoHuntLobbyChanged($room->id));
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
