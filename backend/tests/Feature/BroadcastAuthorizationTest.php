<?php

namespace Tests\Feature;

use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Tests\TestCase;

class BroadcastAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_team_members_can_authorize_private_channel(): void
    {
        $owner = User::factory()->create();
        $outsider = User::factory()->create();
        $team = Team::create(['game_name' => '英雄联盟', 'owner_id' => $owner->id]);
        $team->members()->attach($owner, ['joined_at' => now()]);
        $callback = Broadcast::connection()->getChannels()->get('team.{teamId}');

        $this->assertNotNull($callback);
        $this->assertTrue($callback($owner, $team->id));
        $this->assertFalse($callback($outsider, $team->id));
    }
}
