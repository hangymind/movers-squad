<?php

namespace Tests\Feature;

use App\Events\PublicMessageCreated;
use App\Models\PublicMessage;
use App\Models\User;
use App\Services\PublicRoomVoiceService;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Mockery;
use Tests\TestCase;

class PublicRoomTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_unverified_user_can_send_and_paginate_public_messages(): void
    {
        Event::fake([PublicMessageCreated::class]);
        $user = User::factory()->create(['florr_verified_at' => null]);

        foreach (range(1, 55) as $index) {
            PublicMessage::query()->create(['user_id' => $user->id, 'body' => "message {$index}"]);
        }

        $first = $this->actingAs($user)->getJson('/api/public-room/messages')
            ->assertOk()
            ->assertJsonCount(50, 'data')
            ->assertJsonPath('meta.hasMore', true);
        $before = $first->json('meta.nextBefore');
        $second = $this->actingAs($user)->getJson("/api/public-room/messages?before={$before}")
            ->assertOk()
            ->assertJsonCount(5, 'data');
        $response = $this->actingAs($user)->postJson('/api/public-room/messages', ['body' => '  大家好  '])
            ->assertCreated()
            ->assertJsonPath('data.body', '大家好')
            ->assertJsonPath('data.sender.id', $user->id);

        $this->assertEmpty(array_intersect($first->json('data.*.id'), $second->json('data.*.id')));
        Event::assertDispatched(PublicMessageCreated::class, fn (PublicMessageCreated $event) => $event->message->id === $response->json('data.id'));
    }

    public function test_public_message_validation_and_retention_keep_latest_five_hundred(): void
    {
        Event::fake([PublicMessageCreated::class]);
        $user = User::factory()->create();
        foreach (range(1, 500) as $index) {
            PublicMessage::query()->create(['user_id' => $user->id, 'body' => "message {$index}"]);
        }
        $oldestId = PublicMessage::query()->oldest('id')->value('id');

        $this->actingAs($user)->postJson('/api/public-room/messages', ['body' => 'newest'])->assertCreated();

        $this->assertSame(500, PublicMessage::query()->count());
        $this->assertFalse(PublicMessage::query()->whereKey($oldestId)->exists());
        $this->assertSame('newest', PublicMessage::query()->latest('id')->value('body'));
        $this->actingAs($user)->postJson('/api/public-room/messages', ['body' => '   '])->assertUnprocessable();
        $this->actingAs($user)->postJson('/api/public-room/messages', ['body' => str_repeat('a', 2001)])->assertUnprocessable();
    }

    public function test_public_voice_token_uses_shared_room_without_florr_verification(): void
    {
        $user = User::factory()->create(['florr_verified_at' => null]);
        $secret = str_repeat('s', 64);
        config()->set('services.livekit', ['url' => 'wss://voice.example.com', 'key' => 'test-key', 'secret' => $secret]);

        $response = $this->actingAs($user)->postJson('/api/public-room/voice-token')
            ->assertOk()
            ->assertJsonPath('data.serverUrl', 'wss://voice.example.com')
            ->assertJsonPath('data.roomName', 'movers-public');
        $claims = JWT::decode($response->json('data.token'), new Key($secret, 'HS256'));

        $this->assertSame("user:{$user->id}", $claims->sub);
        $this->assertSame('movers-public', $claims->video->room);
        $this->assertSame(['microphone'], $claims->video->canPublishSources);
        $this->assertFalse($claims->video->canPublishData);
    }

    public function test_voice_participant_list_uses_service(): void
    {
        $viewer = User::factory()->create();
        $participants = User::factory()->count(2)->create();
        $voice = Mockery::mock(PublicRoomVoiceService::class);
        $voice->shouldReceive('participants')->once()->andReturn($participants);
        $this->app->instance(PublicRoomVoiceService::class, $voice);

        $this->actingAs($viewer)->getJson('/api/public-room/voice-participants')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.count', 2)
            ->assertJsonPath('meta.available', true);

    }

    public function test_voice_participant_failure_is_non_blocking(): void
    {
        $viewer = User::factory()->create();

        $failedVoice = Mockery::mock(PublicRoomVoiceService::class);
        $failedVoice->shouldReceive('participants')->once()->andThrow(new \RuntimeException('offline'));
        $this->app->instance(PublicRoomVoiceService::class, $failedVoice);
        $this->actingAs($viewer)->getJson('/api/public-room/voice-participants')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.available', false);
    }

    public function test_guests_and_banned_users_cannot_access_public_room_api(): void
    {
        $this->getJson('/api/public-room/messages')->assertUnauthorized();
        $banned = User::factory()->create(['banned_at' => now(), 'ban_id' => 'ban-public']);

        $this->actingAs($banned)->getJson('/api/public-room/messages')->assertForbidden();
        $this->actingAs($banned)->postJson('/api/public-room/messages', ['body' => 'blocked'])->assertForbidden();
        $this->actingAs($banned)->postJson('/api/public-room/voice-token')->assertForbidden();
    }
}
