<?php

namespace Tests\Feature;

use App\Events\TeamClosed;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class AdminTeamTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_close_and_delete_teams(): void
    {
        Event::fake([TeamClosed::class]);
        $admin = User::factory()->create(['is_admin' => true]);
        $owner = User::factory()->create();
        $team = Team::create(['game_name' => 'Florr.io', 'owner_id' => $owner->id, 'max_members' => 3]);
        $team->members()->attach($owner, ['joined_at' => now()]);

        $this->actingAs($admin)->getJson('/api/admin/teams')
            ->assertOk()
            ->assertJsonPath('data.0.id', $team->id)
            ->assertJsonPath('data.0.maxMembers', 3);

        $closed = $this->actingAs($admin)->postJson("/api/admin/teams/{$team->id}/close")->assertOk();
        $this->assertNotNull($closed->json('data.closedAt'));
        Event::assertDispatched(TeamClosed::class);

        $this->actingAs($admin)->deleteJson("/api/admin/teams/{$team->id}")->assertNoContent();
        $this->assertDatabaseMissing('teams', ['id' => $team->id]);
        $this->assertDatabaseMissing('team_members', ['team_id' => $team->id]);
    }

    public function test_non_admin_cannot_manage_teams(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/admin/teams')->assertForbidden();
    }
}
