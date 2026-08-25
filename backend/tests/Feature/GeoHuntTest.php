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

class GeoHuntTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_verified_players_can_use_geo_hunt(): void
    {
        $user = User::factory()->create(['florr_verified_at' => null]);

        $this->actingAs($user)->getJson('/api/geo-hunt/lobby')->assertForbidden();
        $this->actingAs($user)->postJson('/api/geo-hunt/queue')->assertForbidden();
    }

    public function test_map_endpoint_returns_cacheable_compact_document(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->getJson('/api/geo-hunt/maps/garden')
            ->assertOk()->assertJsonPath('data.layers.0.encoding', 'base64-gzip-u32le');

        $etag = $response->headers->get('ETag');
        $this->assertNotNull($etag);
        $this->assertLessThan(100_000, strlen($response->getContent()));
        $this->actingAs($user)->withHeader('If-None-Match', $etag)->getJson('/api/geo-hunt/maps/garden')->assertNotModified();
    }

    public function test_two_players_are_atomically_matched_and_can_resume(): void
    {
        [$first, $second] = User::factory()->count(2)->create();

        $this->actingAs($first)->postJson('/api/geo-hunt/queue')
            ->assertOk()->assertJsonPath('data.queued', true);
        $response = $this->actingAs($second)->postJson('/api/geo-hunt/queue')
            ->assertOk()->assertJsonPath('data.queued', false);

        $matchId = $response->json('data.matchId');
        $this->assertDatabaseCount('geo_hunt_queue_entries', 0);
        $this->assertDatabaseCount('geo_hunt_match_players', 2);
        $this->assertDatabaseCount('geo_hunt_rounds', 1);
        $this->actingAs($first)->getJson('/api/geo-hunt/lobby')->assertJsonPath('data.currentMatchId', $matchId);
        $this->actingAs($first)->getJson("/api/geo-hunt/matches/{$matchId}")
            ->assertOk()->assertJsonPath('data.status', 'playing')->assertJsonMissingPath('data.round.result.target');
    }

    public function test_queue_join_is_idempotent_and_stale_entries_are_removed(): void
    {
        $user = User::factory()->create();
        $stale = User::factory()->create();
        GeoHuntQueueEntry::query()->create(['user_id' => $stale->id, 'joined_at' => now()->subMinute(), 'heartbeat_at' => now()->subMinute()]);

        $this->actingAs($user)->postJson('/api/geo-hunt/queue')->assertOk();
        $this->actingAs($user)->postJson('/api/geo-hunt/queue')->assertOk()->assertJsonPath('data.queued', true);

        $this->assertDatabaseCount('geo_hunt_queue_entries', 1);
        $this->assertDatabaseMissing('geo_hunt_queue_entries', ['user_id' => $stale->id]);
    }

    public function test_round_scores_damage_and_rejects_a_second_guess(): void
    {
        [$first, $second, $match] = $this->matchPlayers();
        $round = GeoHuntRound::query()->where('match_id', $match->id)->firstOrFail();

        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => $round->target_x, 'y' => $round->target_y])
            ->assertOk()->assertJsonPath('data.round.submitted', true);
        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => 0.1, 'y' => 0.1])
            ->assertOk();
        $response = $this->actingAs($second)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => 0, 'y' => 0])
            ->assertOk()->assertJsonPath('data.status', 'reveal');

        $this->assertSame(2, $response->json('data.round.result.guesses') ? count($response->json('data.round.result.guesses')) : 0);
        $this->assertGreaterThan(0, $response->json('data.round.result.damage'));
        $this->assertSame(5000, collect($response->json('data.round.result.guesses'))->firstWhere('userId', $first->id)['score']);
    }

    public function test_first_guess_shortens_deadline_and_invalid_coordinates_are_rejected(): void
    {
        [$first, , $match] = $this->matchPlayers();
        $round = GeoHuntRound::query()->where('match_id', $match->id)->firstOrFail();

        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => 1.01, 'y' => 0.5])
            ->assertUnprocessable();
        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => $round->target_x, 'y' => $round->target_y])
            ->assertOk();

        $remaining = now()->diffInSeconds($round->fresh()->deadline_at, false);
        $this->assertGreaterThanOrEqual(28, $remaining);
        $this->assertLessThanOrEqual(30, $remaining);
    }

    public function test_timeout_creates_zero_score_tie_without_damage(): void
    {
        [$first, , $match] = $this->matchPlayers();
        GeoHuntRound::query()->where('match_id', $match->id)->update(['deadline_at' => now()->subSecond()]);

        $response = $this->actingAs($first)->getJson("/api/geo-hunt/matches/{$match->id}")
            ->assertOk()->assertJsonPath('data.status', 'reveal')->assertJsonPath('data.round.result.damage', 0);

        $this->assertSame([0, 0], collect($response->json('data.round.result.guesses'))->pluck('score')->sort()->values()->all());
        $this->assertDatabaseCount('geo_hunt_guesses', 2);
    }

    public function test_round_five_uses_one_point_five_damage_multiplier(): void
    {
        [$first, $second, $match] = $this->matchPlayers();
        $round = GeoHuntRound::query()->where('match_id', $match->id)->firstOrFail();
        $match->update(['round_number' => 4]);
        $round->update(['number' => 4]);

        foreach ([$first, $second] as $player) {
            $this->actingAs($player)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => $round->target_x, 'y' => $round->target_y])->assertOk();
        }
        $round->fresh()->update(['reveal_until' => now()->subSecond()]);

        $this->actingAs($first)->getJson("/api/geo-hunt/matches/{$match->id}")
            ->assertOk()->assertJsonPath('data.round.number', 5)->assertJsonPath('data.round.multiplier', 1.5);
    }

    public function test_normal_knockout_awards_winner_and_loser_experience_once(): void
    {
        [$first, $second, $match] = $this->matchPlayers();
        $round = GeoHuntRound::query()->where('match_id', $match->id)->firstOrFail();
        GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('user_id', $second->id)->update(['hp' => 1]);
        $farX = $round->target_x < 0.5 ? 1 : 0;
        $farY = $round->target_y < 0.5 ? 1 : 0;

        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => $round->target_x, 'y' => $round->target_y])->assertOk();
        $this->actingAs($second)->postJson("/api/geo-hunt/matches/{$match->id}/guess", ['x' => $farX, 'y' => $farY])
            ->assertOk()->assertJsonPath('data.status', 'finished')->assertJsonPath('data.winnerId', $first->id);

        $this->assertSame(100, GeoHuntProfile::query()->findOrFail($first->id)->experience);
        $this->assertSame(40, GeoHuntProfile::query()->findOrFail($second->id)->experience);
    }

    public function test_forfeit_awards_experience_once(): void
    {
        [$first, $second, $match] = $this->matchPlayers();

        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/forfeit")
            ->assertOk()->assertJsonPath('data.winnerId', $second->id)->assertJsonPath('data.endedReason', 'forfeit');
        $this->actingAs($first)->postJson("/api/geo-hunt/matches/{$match->id}/forfeit")->assertOk();

        $this->assertSame(0, GeoHuntProfile::query()->findOrFail($first->id)->experience);
        $this->assertSame(100, GeoHuntProfile::query()->findOrFail($second->id)->experience);
        $this->assertSame(1, GeoHuntProfile::query()->findOrFail($second->id)->wins);
    }

    public function test_one_stale_player_loses_after_disconnect_grace(): void
    {
        [$first, $second, $match] = $this->matchPlayers();
        GeoHuntMatchPlayer::query()->where('match_id', $match->id)->where('user_id', $first->id)->update(['heartbeat_at' => now()->subSeconds(31)]);

        $this->actingAs($second)->postJson("/api/geo-hunt/matches/{$match->id}/heartbeat")
            ->assertOk()->assertJsonPath('data.winnerId', $second->id)->assertJsonPath('data.endedReason', 'disconnect');
    }

    private function matchPlayers(): array
    {
        [$first, $second] = User::factory()->count(2)->create();
        $this->actingAs($first)->postJson('/api/geo-hunt/queue')->assertOk();
        $matchId = $this->actingAs($second)->postJson('/api/geo-hunt/queue')->assertOk()->json('data.matchId');

        return [$first, $second, GeoHuntMatch::query()->findOrFail($matchId)];
    }
}
