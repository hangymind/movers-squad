<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_api_requests_return_json_without_an_accept_header(): void
    {
        $this->get('/api/user')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeaders([
            'Origin' => 'http://localhost:9191',
            'Referer' => 'http://localhost:9191/',
        ]);
    }

    public function test_user_can_register_and_receives_a_session(): void
    {
        $response = $this->postJson('/api/register', [
            'florrId' => 'florr-player-001',
            'level' => 12,
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.florrId', 'florr-player-001')
            ->assertJsonPath('data.level', 12)
            ->assertJsonPath('data.avatarUrl', null)
            ->assertJsonMissingPath('data.password');
        $response->assertJsonPath('data.reverbKey', config('broadcasting.connections.reverb.key'))
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'no-referrer');
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['florr_id' => 'florr-player-001']);
        $registered = User::where('florr_id', 'florr-player-001')->firstOrFail();
        $this->assertFalse($registered->is_admin);
        $this->assertNull($registered->florr_verified_at);
    }

    public function test_first_registration_of_reserved_florr_id_becomes_admin(): void
    {
        $this->postJson('/api/register', [
            'florrId' => 'Xyiw46_',
            'password' => 'admin-password',
            'password_confirmation' => 'admin-password',
        ])->assertCreated()->assertJsonPath('data.isAdmin', true);

        $this->assertDatabaseHas('users', ['florr_id' => 'Xyiw46_', 'is_admin' => true]);
        $this->assertNotNull(User::where('florr_id', 'Xyiw46_')->firstOrFail()->florr_verified_at);
        $this->postJson('/api/register', [
            'florrId' => 'Xyiw46_',
            'password' => 'another-password',
            'password_confirmation' => 'another-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('florrId');
    }

    public function test_registration_validates_unique_florr_id_and_password_confirmation(): void
    {
        User::factory()->create(['florr_id' => 'florr-taken']);

        $this->postJson('/api/register', [
            'florrId' => 'florr-taken',
            'password' => 'password123',
            'password_confirmation' => 'different',
        ])->assertUnprocessable()->assertJsonValidationErrors(['florrId', 'password']);
    }

    public function test_registration_requires_a_florr_id(): void
    {
        $this->postJson('/api/register', [
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertUnprocessable()->assertJsonValidationErrors('florrId');
    }

    public function test_user_can_login_fetch_profile_and_logout(): void
    {
        $user = User::factory()->create([
            'florr_id' => 'returning-player-id',
            'password' => 'password123',
        ]);

        $this->postJson('/api/login', [
            'florrId' => 'returning-player-id',
            'password' => 'password123',
        ])->assertOk()->assertJsonPath('data.id', $user->id);

        $this->getJson('/api/user')->assertOk()
            ->assertJsonPath('data.florrId', $user->florr_id);
        $this->postJson('/api/logout')->assertNoContent();
        $this->assertGuest();
    }

    public function test_user_can_set_a_safe_https_avatar_url(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->patchJson('/api/user', [
            'avatarUrl' => 'https://cdn.example.com/avatars/player.png?size=96&signature=abc123',
        ])->assertOk()->assertJsonPath(
            'data.avatarUrl',
            'https://cdn.example.com/avatars/player.png?size=96&signature=abc123',
        );
    }

    public function test_unsafe_avatar_urls_are_rejected(): void
    {
        $user = User::factory()->create();
        $unsafeUrls = [
            'http://cdn.example.com/avatar.png',
            'https://user:password@cdn.example.com/avatar.png',
            'https://cdn.example.com:8443/avatar.png',
            'https://cdn.example.com/avatar.png#fragment',
            'https://localhost/avatar.png',
            'https://avatars.local/avatar.png',
            'https://127.0.0.1/avatar.png',
            'https://[::1]/avatar.png',
            'javascript:alert(1)',
        ];

        foreach ($unsafeUrls as $unsafeUrl) {
            $this->actingAs($user)->patchJson('/api/user', ['avatarUrl' => $unsafeUrl])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('avatarUrl');
        }
    }

    public function test_unsafe_legacy_avatar_url_is_not_serialized(): void
    {
        $user = User::factory()->create(['avatar_url' => 'http://127.0.0.1/private.png']);

        $this->actingAs($user)->getJson('/api/user')
            ->assertOk()
            ->assertJsonPath('data.avatarUrl', null);
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        User::factory()->create(['florr_id' => 'player-id']);

        $this->postJson('/api/login', [
            'florrId' => 'player-id',
            'password' => 'incorrect-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('florrId');
    }
}
