<?php

namespace Tests\Feature;

use App\Models\GeoHuntMatch;
use App\Models\GeoHuntMatchPlayer;
use App\Models\GeoHuntProfile;
use App\Models\GeoHuntQueueEntry;
use App\Models\GeoHuntRound;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GeoHuntRoomTest extends TestCase
{
    use RefreshDatabase;

    public function test_players_create_private_rooms_and_admins_create_public_named_rooms(): void
    {
        $player = User::factory()->create();
        $admin = User::factory()->create(['is_admin' => true]);

        $private = $this->actingAs($player)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 8])
            ->assertCreated()->assertJsonPath('data.mode', 'private')->assertJsonPath('data.maxPlayers', 8);
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{6}$/', $private->json('data.code'));

        $this->actingAs(User::factory()->create())->postJson('/api/geo-hunt/rooms', ['mode' => 'admin_public', 'name' => '公开测试', 'maxPlayers' => 4])->assertForbidden();
        $public = $this->actingAs($admin)->postJson('/api/geo-hunt/rooms', ['mode' => 'admin_public', 'name' => '公开测试', 'maxPlayers' => 4])
            ->assertCreated()->assertJsonPath('data.name', '公开测试');
        $this->actingAs(User::factory()->create())->getJson('/api/geo-hunt/lobby')
            ->assertOk()->assertJsonPath('data.publicRooms.0.code', $public->json('data.code'));
    }

    public function test_room_codes_are_case_insensitive_capacity_is_enforced_and_only_host_starts(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $extra = User::factory()->create();
        $code = $this->actingAs($host)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 2])->json('data.code');

        $this->actingAs($guest)->postJson('/api/geo-hunt/rooms/join', ['code' => strtolower($code)])
            ->assertOk()->assertJsonPath('data.playerCount', 2);
        $this->actingAs($extra)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertConflict();
        $this->actingAs($guest)->postJson("/api/geo-hunt/rooms/{$code}/start")->assertForbidden();
        $matchId = $this->actingAs($host)->postJson("/api/geo-hunt/rooms/{$code}/start")
            ->assertOk()->json('data.matchId');
        $this->assertDatabaseHas('geo_hunt_matches', ['id' => $matchId, 'status' => 'playing', 'mode' => 'private']);
    }

    public function test_four_player_round_damages_every_lower_score_and_custom_room_awards_no_xp(): void
    {
        $players = User::factory()->count(4)->create();
        $host = $players[0];
        $code = $this->actingAs($host)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 4])->json('data.code');
        foreach ($players->slice(1) as $player) {
            $this->actingAs($player)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertOk();
        }
        $matchId = $this->actingAs($host)->postJson("/api/geo-hunt/rooms/{$code}/start")->json('data.matchId');
        $round = GeoHuntRound::query()->where('match_id', $matchId)->firstOrFail();
        GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('user_id', '!=', $host->id)->update(['hp' => 1]);

        $this->actingAs($host)->postJson("/api/geo-hunt/matches/{$matchId}/guess", ['x' => $round->target_x, 'y' => $round->target_y])->assertOk();
        foreach ($players->slice(1, 2) as $player) {
            $this->actingAs($player)->postJson("/api/geo-hunt/matches/{$matchId}/guess", ['x' => 0, 'y' => 0])->assertOk();
        }
        $response = $this->actingAs($players[3])->postJson("/api/geo-hunt/matches/{$matchId}/guess", ['x' => 0, 'y' => 0])
            ->assertOk()->assertJsonPath('data.status', 'finished')->assertJsonPath('data.winnerId', $host->id);

        $guesses = collect($response->json('data.round.result.guesses'));
        $this->assertSame(0, $guesses->firstWhere('userId', $host->id)['damageTaken']);
        foreach ($players->slice(1) as $player) {
            $this->assertGreaterThan(0, $guesses->firstWhere('userId', $player->id)['damageTaken']);
        }
        foreach ($players as $player) {
            $profile = GeoHuntProfile::query()->find($player->id);
            $this->assertTrue($profile === null || ($profile->experience === 0 && $profile->matches_played === 0));
        }
    }

    public function test_admin_lists_and_closes_active_custom_room(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $host = User::factory()->create();
        $roomId = $this->actingAs($host)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 3])->json('data.id');

        $this->actingAs($admin)->getJson('/api/admin/geo-hunt/rooms')->assertOk()->assertJsonPath('data.0.id', $roomId);
        $this->actingAs($admin)->postJson("/api/admin/geo-hunt/rooms/{$roomId}/close")->assertNoContent();
        $this->assertDatabaseHas('geo_hunt_matches', ['id' => $roomId, 'status' => 'finished', 'ended_reason' => 'admin_closed']);
        $this->actingAs(User::factory()->create())->getJson('/api/admin/geo-hunt/rooms')->assertForbidden();
    }

    public function test_admin_public_room_requires_a_non_whitespace_name(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);

        $this->actingAs($admin)->postJson('/api/geo-hunt/rooms', [
            'mode' => 'admin_public', 'name' => "  \t ", 'maxPlayers' => 4,
        ])->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_members_can_leave_and_host_leaving_closes_the_waiting_room(): void
    {
        $host = User::factory()->create();
        $guest = User::factory()->create();
        $code = $this->actingAs($host)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 4])->json('data.code');
        $matchId = GeoHuntMatch::query()->where('room_code', $code)->value('id');
        $this->actingAs($guest)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertOk();

        $this->actingAs($guest)->deleteJson("/api/geo-hunt/rooms/{$code}/members/me")->assertNoContent();
        $this->assertDatabaseMissing('geo_hunt_match_players', ['match_id' => $matchId, 'user_id' => $guest->id]);

        $this->actingAs($host)->deleteJson("/api/geo-hunt/rooms/{$code}/members/me")->assertNoContent();
        $this->assertDatabaseHas('geo_hunt_matches', ['id' => $matchId, 'status' => 'finished', 'ended_reason' => 'host_closed']);
    }

    public function test_room_transition_clears_queue_and_an_active_room_blocks_another_join(): void
    {
        $host = User::factory()->create();
        $player = User::factory()->create();
        GeoHuntQueueEntry::query()->create(['user_id' => $player->id, 'joined_at' => now(), 'heartbeat_at' => now()]);

        $firstCode = $this->actingAs($player)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 2])
            ->assertCreated()->json('data.code');
        $this->assertDatabaseMissing('geo_hunt_queue_entries', ['user_id' => $player->id]);

        $secondCode = $this->actingAs($host)->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 2])->json('data.code');
        $this->actingAs($player)->postJson('/api/geo-hunt/rooms/join', ['code' => $secondCode])->assertConflict();
        $this->assertDatabaseHas('geo_hunt_matches', ['room_code' => $firstCode, 'status' => 'waiting']);
    }

    public function test_eight_player_room_capacity_is_enforced(): void
    {
        $players = User::factory()->count(9)->create();
        $code = $this->actingAs($players[0])->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 8])->json('data.code');
        foreach ($players->slice(1, 7) as $player) {
            $this->actingAs($player)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertOk();
        }

        $this->actingAs($players[8])->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertConflict();
        $this->assertSame(8, GeoHuntMatch::query()->where('room_code', $code)->firstOrFail()->players()->count());
    }

    public function test_public_rooms_disappear_from_lobby_after_start_or_admin_close(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $guest = User::factory()->create();
        $observer = User::factory()->create();
        $startedCode = $this->actingAs($admin)->postJson('/api/geo-hunt/rooms', ['mode' => 'admin_public', 'name' => '即将开始', 'maxPlayers' => 4])->json('data.code');
        $this->actingAs($guest)->postJson('/api/geo-hunt/rooms/join', ['code' => $startedCode])->assertOk();
        $this->actingAs($admin)->postJson("/api/geo-hunt/rooms/{$startedCode}/start")->assertOk();
        $this->actingAs($observer)->getJson('/api/geo-hunt/lobby')->assertOk()->assertJsonMissing(['code' => $startedCode]);

        $closingAdmin = User::factory()->create(['is_admin' => true]);
        $closed = $this->actingAs($closingAdmin)->postJson('/api/geo-hunt/rooms', ['mode' => 'admin_public', 'name' => '即将关闭', 'maxPlayers' => 4]);
        $this->actingAs($closingAdmin)->postJson('/api/admin/geo-hunt/rooms/'.$closed->json('data.id').'/close')->assertNoContent();
        $this->actingAs($observer)->getJson('/api/geo-hunt/lobby')->assertOk()->assertJsonMissing(['code' => $closed->json('data.code')]);
    }

    public function test_tied_top_scores_take_no_damage(): void
    {
        $players = User::factory()->count(3)->create();
        $code = $this->actingAs($players[0])->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 3])->json('data.code');
        foreach ($players->slice(1) as $player) {
            $this->actingAs($player)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertOk();
        }
        $matchId = $this->actingAs($players[0])->postJson("/api/geo-hunt/rooms/{$code}/start")->json('data.matchId');
        $round = GeoHuntRound::query()->where('match_id', $matchId)->firstOrFail();
        GeoHuntMatchPlayer::query()->where('match_id', $matchId)->where('user_id', $players[2]->id)->update(['hp' => 1]);

        foreach ($players->take(2) as $player) {
            $this->actingAs($player)->postJson("/api/geo-hunt/matches/{$matchId}/guess", ['x' => $round->target_x, 'y' => $round->target_y])->assertOk();
        }
        $response = $this->actingAs($players[2])->postJson("/api/geo-hunt/matches/{$matchId}/guess", ['x' => 0, 'y' => 0])->assertOk();
        $guesses = collect($response->json('data.round.result.guesses'));

        $this->assertSame(0, $guesses->firstWhere('userId', $players[0]->id)['damageTaken']);
        $this->assertSame(0, $guesses->firstWhere('userId', $players[1]->id)['damageTaken']);
        $this->assertGreaterThan(0, $guesses->firstWhere('userId', $players[2]->id)['damageTaken']);
    }

    public function test_players_disconnected_together_share_placement_and_match_continues(): void
    {
        $players = User::factory()->count(4)->create();
        $code = $this->actingAs($players[0])->postJson('/api/geo-hunt/rooms', ['mode' => 'private', 'maxPlayers' => 4])->json('data.code');
        foreach ($players->slice(1) as $player) {
            $this->actingAs($player)->postJson('/api/geo-hunt/rooms/join', ['code' => $code])->assertOk();
        }
        $matchId = $this->actingAs($players[0])->postJson("/api/geo-hunt/rooms/{$code}/start")->json('data.matchId');
        GeoHuntMatchPlayer::query()->where('match_id', $matchId)->whereIn('user_id', [$players[2]->id, $players[3]->id])
            ->update(['heartbeat_at' => now()->subSeconds(31)]);

        $this->actingAs($players[0])->postJson("/api/geo-hunt/matches/{$matchId}/heartbeat")
            ->assertOk()->assertJsonPath('data.status', 'playing');
        foreach ([$players[2], $players[3]] as $player) {
            $this->assertDatabaseHas('geo_hunt_match_players', ['match_id' => $matchId, 'user_id' => $player->id, 'hp' => 0, 'placement' => 3]);
        }
    }
}
