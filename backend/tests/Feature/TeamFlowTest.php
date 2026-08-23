<?php

namespace Tests\Feature;

use App\Events\TeamClosed;
use App\Events\TeamCreated;
use App\Events\TeamMemberJoined;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use RuntimeException;
use Tests\TestCase;

class TeamFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_authentication_is_required_for_team_endpoints(): void
    {
        $this->getJson('/api/teams')->assertUnauthorized();
        $this->postJson('/api/teams', ['gameName' => 'APEX'])->assertUnauthorized();
    }

    public function test_owner_can_create_a_team_and_is_the_first_member(): void
    {
        $owner = User::factory()->create();

        $response = $this->actingAs($owner)->postJson('/api/teams', [
            'gameName' => 'APEX 英雄',
            'note' => '晚上九点开局',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.owner.id', $owner->id)
            ->assertJsonPath('data.gameName', 'Florr.io')
            ->assertJsonPath('data.owner.florrId', $owner->florr_id)
            ->assertJsonPath('data.memberCount', 1)
            ->assertJsonPath('data.members.0.id', $owner->id)
            ->assertJsonPath('data.maxMembers', 4);
        $this->assertDatabaseHas('team_members', ['user_id' => $owner->id]);
    }

    public function test_owner_can_atomically_replace_an_active_recruitment(): void
    {
        Event::fake([TeamClosed::class, TeamCreated::class]);
        [$oldTeam, $owner] = $this->createTeam();
        $member = User::factory()->create();
        $oldTeam->members()->attach($member, ['joined_at' => now()]);

        $response = $this->actingAs($owner)->postJson('/api/teams', [
            'note' => '新的招募',
            'replaceCurrentTeam' => true,
        ])->assertCreated();

        $newTeamId = $response->json('data.id');
        $this->assertNotNull($oldTeam->fresh()->closed_at);
        $this->assertDatabaseHas('team_members', ['team_id' => $newTeamId, 'user_id' => $owner->id]);
        $this->actingAs($member)->getJson('/api/teams')->assertJsonMissingPath('data.1');
        Event::assertDispatched(TeamClosed::class, fn (TeamClosed $event) => $event->team->is($oldTeam));
        Event::assertDispatched(TeamCreated::class, fn (TeamCreated $event) => $event->team->id === $newTeamId);
    }

    public function test_member_can_replace_the_team_they_joined(): void
    {
        [$team] = $this->createTeam();
        $member = User::factory()->create();
        $team->members()->attach($member, ['joined_at' => now()]);

        $response = $this->actingAs($member)->postJson('/api/teams', ['replaceCurrentTeam' => true])
            ->assertCreated();

        $this->assertNull($team->fresh()->closed_at);
        $this->assertDatabaseHas('team_members', ['team_id' => $response->json('data.id'), 'user_id' => $member->id]);
        $this->assertDatabaseMissing('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);
    }

    public function test_replacement_cleans_up_duplicate_active_recruitments_from_legacy_data(): void
    {
        Event::fake([TeamClosed::class, TeamCreated::class]);
        [$firstTeam, $owner] = $this->createTeam();
        $duplicateTeam = Team::create(['game_name' => 'Florr.io', 'owner_id' => $owner->id]);
        $duplicateTeam->members()->attach($owner, ['joined_at' => now()]);

        $this->actingAs($owner)->postJson('/api/teams', ['replaceCurrentTeam' => true])
            ->assertCreated();

        $this->assertNotNull($firstTeam->fresh()->closed_at);
        $this->assertNotNull($duplicateTeam->fresh()->closed_at);
        $this->actingAs($owner)->getJson('/api/teams')->assertJsonCount(1, 'data');
        Event::assertDispatchedTimes(TeamClosed::class, 2);
    }

    public function test_user_can_join_and_event_contains_only_public_profile_data(): void
    {
        Event::fake([TeamMemberJoined::class]);
        [$team, $owner] = $this->createTeam();
        $joiner = User::factory()->create([
            'username' => 'new_member',
            'florr_id' => 'florr-7788',
            'avatar_url' => 'https://example.com/joiner.png',
        ]);

        $this->actingAs($joiner)->postJson("/api/teams/{$team->id}/join")
            ->assertOk()
            ->assertJsonPath('data.memberCount', 2);

        Event::assertDispatched(TeamMemberJoined::class, function (TeamMemberJoined $event) use ($team, $joiner): bool {
            $payload = $event->broadcastWith();

            return $event->team->is($team)
                && $event->joinedUser->is($joiner)
                && $payload['joinedUser']['florrId'] === 'florr-7788'
                && $payload['joinedUser']['avatarUrl'] === 'https://example.com/joiner.png'
                && ! array_key_exists('password', $payload['joinedUser']);
        });
        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $owner->id]);
        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $joiner->id]);
    }

    public function test_join_still_succeeds_when_realtime_broadcasting_fails(): void
    {
        [$team] = $this->createTeam();
        $joiner = User::factory()->create();
        Event::listen(TeamMemberJoined::class, fn () => throw new RuntimeException('Reverb unavailable'));

        $this->actingAs($joiner)->postJson("/api/teams/{$team->id}/join")
            ->assertOk()
            ->assertJsonPath('data.memberCount', 2);

        $this->assertDatabaseHas('team_members', ['team_id' => $team->id, 'user_id' => $joiner->id]);
    }

    public function test_team_list_does_not_expose_private_account_fields(): void
    {
        [$team, $owner] = $this->createTeam();
        $viewer = User::factory()->create();

        $this->actingAs($viewer)->getJson('/api/teams')
            ->assertOk()
            ->assertJsonPath('data.0.owner.id', $owner->id)
            ->assertJsonMissingPath('data.0.owner.banId')
            ->assertJsonMissingPath('data.0.owner.bannedAt')
            ->assertJsonMissingPath('data.0.owner.reverbKey');
    }

    public function test_duplicate_join_and_fifth_member_are_rejected(): void
    {
        [$team] = $this->createTeam();
        $members = User::factory()->count(4)->create();

        $this->actingAs($members[0])->postJson("/api/teams/{$team->id}/join")->assertOk();
        $this->actingAs($members[0])->postJson("/api/teams/{$team->id}/join")->assertConflict();
        $this->actingAs($members[1])->postJson("/api/teams/{$team->id}/join")->assertOk();
        $this->actingAs($members[2])->postJson("/api/teams/{$team->id}/join")->assertOk();
        $this->actingAs($members[3])->postJson("/api/teams/{$team->id}/join")->assertConflict();

        $this->assertSame(Team::MAX_MEMBERS, $team->members()->count());
    }

    public function test_member_can_leave_and_owner_must_close_instead(): void
    {
        [$team, $owner] = $this->createTeam();
        $member = User::factory()->create();
        $team->members()->attach($member, ['joined_at' => now()]);

        $this->actingAs($owner)->deleteJson("/api/teams/{$team->id}/members/me")->assertUnprocessable();
        $this->actingAs($member)->deleteJson("/api/teams/{$team->id}/members/me")->assertNoContent();
        $this->assertDatabaseMissing('team_members', ['team_id' => $team->id, 'user_id' => $member->id]);
    }

    public function test_only_owner_can_close_and_closed_team_cannot_be_joined(): void
    {
        [$team, $owner] = $this->createTeam();
        $other = User::factory()->create();

        $this->actingAs($other)->postJson("/api/teams/{$team->id}/close")->assertForbidden();
        $this->actingAs($owner)->postJson("/api/teams/{$team->id}/close")->assertOk();
        $this->actingAs($other)->postJson("/api/teams/{$team->id}/join")->assertConflict();
        $this->actingAs($other)->getJson('/api/teams')->assertJsonCount(0, 'data');
    }

    private function createTeam(): array
    {
        $owner = User::factory()->create();
        $team = Team::create(['game_name' => 'Valorant', 'owner_id' => $owner->id]);
        $team->members()->attach($owner, ['joined_at' => now()]);

        return [$team, $owner];
    }
}
