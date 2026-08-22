<?php

namespace Tests\Feature;

use App\Events\TeamAssembled;
use App\Events\TeamMessageCreated;
use App\Models\Team;
use App\Models\TeamMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Tests\TestCase;

class TeamRoomTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_only_have_one_active_team(): void
    {
        [$first, $owner] = $this->teamWithMembers(1);
        $other = User::factory()->create();

        $this->actingAs($owner)->postJson('/api/teams')->assertConflict();
        $this->actingAs($owner)->postJson("/api/teams/{$first->id}/join")->assertConflict();
        $this->actingAs($other)->postJson("/api/teams/{$first->id}/join")->assertOk();
        $this->actingAs($other)->postJson('/api/teams')->assertConflict();
    }

    public function test_fourth_member_assembles_team_and_removes_it_from_recruitment(): void
    {
        Event::fake([TeamAssembled::class]);
        [$team, $owner] = $this->teamWithMembers(3);
        $fourth = User::factory()->create();

        $this->actingAs($fourth)->postJson("/api/teams/{$team->id}/join")
            ->assertOk()
            ->assertJsonPath('data.isAssembled', true)
            ->assertJsonPath('data.memberCount', 4);

        $this->assertNotNull($team->fresh()->assembled_at);
        $this->actingAs($owner)->getJson('/api/teams')->assertJsonCount(0, 'data');
        $this->actingAs($owner)->getJson('/api/teams/current')->assertJsonPath('data.id', $team->id);
        Event::assertDispatched(TeamAssembled::class, fn (TeamAssembled $event) => $event->team->is($team));
    }

    public function test_assembled_team_detail_is_private_and_member_exit_does_not_reopen_recruitment(): void
    {
        [$team, $owner, $members] = $this->teamWithMembers(4, true);
        $outsider = User::factory()->create();

        $this->actingAs($outsider)->getJson("/api/teams/{$team->id}")->assertNotFound();
        $this->actingAs($members[0])->getJson("/api/teams/{$team->id}")->assertOk();
        $this->actingAs($members[0])->deleteJson("/api/teams/{$team->id}/members/me")->assertNoContent();

        $this->assertNotNull($team->fresh()->assembled_at);
        $this->actingAs($owner)->getJson('/api/teams')->assertJsonCount(0, 'data');
        $this->actingAs($members[0])->getJson("/api/teams/{$team->id}")->assertNotFound();
    }

    public function test_members_can_send_paginate_and_mark_messages_read(): void
    {
        Event::fake([TeamMessageCreated::class]);
        [$team, $owner, $members] = $this->teamWithMembers(4, true);
        $member = $members[0];
        $outsider = User::factory()->create();

        $response = $this->actingAs($owner)->postJson("/api/teams/{$team->id}/messages", ['body' => '  准备出发  '])
            ->assertCreated()
            ->assertJsonPath('data.body', '准备出发');
        $messageId = $response->json('data.id');

        $this->actingAs($member)->getJson("/api/teams/{$team->id}/messages")
            ->assertOk()
            ->assertJsonPath('data.0.id', $messageId)
            ->assertJsonPath('meta.unreadCount', 1);
        $this->actingAs($member)->postJson("/api/teams/{$team->id}/messages/read", ['lastMessageId' => $messageId])->assertNoContent();
        $this->actingAs($member)->getJson("/api/teams/{$team->id}/messages")->assertJsonPath('meta.unreadCount', 0);
        $this->actingAs($outsider)->getJson("/api/teams/{$team->id}/messages")->assertNotFound();
        $this->actingAs($owner)->postJson("/api/teams/{$team->id}/messages", ['body' => '   '])->assertUnprocessable();
        Event::assertDispatched(TeamMessageCreated::class);
    }

    public function test_message_cursor_returns_older_pages_without_duplicates(): void
    {
        [$team, $owner] = $this->teamWithMembers(4, true);
        foreach (range(1, 55) as $index) {
            TeamMessage::create(['team_id' => $team->id, 'user_id' => $owner->id, 'body' => "message {$index}"]);
        }

        $first = $this->actingAs($owner)->getJson("/api/teams/{$team->id}/messages")
            ->assertOk()
            ->assertJsonCount(50, 'data')
            ->assertJsonPath('meta.hasMore', true);
        $before = $first->json('meta.nextBefore');
        $second = $this->actingAs($owner)->getJson("/api/teams/{$team->id}/messages?before={$before}")
            ->assertOk()
            ->assertJsonCount(5, 'data');

        $this->assertEmpty(array_intersect($first->json('data.*.id'), $second->json('data.*.id')));
    }

    public function test_voice_token_is_limited_to_assembled_members(): void
    {
        [$team, $owner] = $this->teamWithMembers(4, true);
        $outsider = User::factory()->create();
        $secret = str_repeat('s', 64);
        config()->set('services.livekit', ['url' => 'wss://voice.example.com', 'key' => 'test-key', 'secret' => $secret]);

        $response = $this->actingAs($owner)->postJson("/api/teams/{$team->id}/voice-token")
            ->assertOk()
            ->assertJsonPath('data.serverUrl', 'wss://voice.example.com')
            ->assertJsonPath('data.roomName', "movers-team-{$team->id}")
            ->assertJson(fn ($json) => $json->whereType('data.token', 'string')->etc());
        $claims = JWT::decode($response->json('data.token'), new Key($secret, 'HS256'));
        $this->assertSame("user:{$owner->id}", $claims->sub);
        $this->assertSame("movers-team-{$team->id}", $claims->video->room);
        $this->assertSame(['microphone'], $claims->video->canPublishSources);
        $this->assertFalse($claims->video->canPublishData);
        $this->actingAs($outsider)->postJson("/api/teams/{$team->id}/voice-token")->assertNotFound();
    }

    private function teamWithMembers(int $count, bool $assembled = false): array
    {
        $owner = User::factory()->create();
        $team = Team::create([
            'game_name' => 'Florr.io',
            'owner_id' => $owner->id,
            'assembled_at' => $assembled ? now() : null,
        ]);
        $team->members()->attach($owner, ['joined_at' => now()]);
        $members = User::factory()->count(max(0, $count - 1))->create();
        foreach ($members as $member) {
            $team->members()->attach($member, ['joined_at' => now()]);
        }

        return [$team, $owner, $members];
    }
}
