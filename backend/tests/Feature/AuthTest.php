<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

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
        $this->assertAuthenticated();
        $this->assertDatabaseHas('users', ['florr_id' => 'florr-player-001']);
        $this->assertFalse(User::where('florr_id', 'florr-player-001')->firstOrFail()->is_admin);
    }

    public function test_first_registration_of_reserved_florr_id_becomes_admin(): void
    {
        $this->postJson('/api/register', [
            'florrId' => 'Xyiw46_',
            'password' => 'admin-password',
            'password_confirmation' => 'admin-password',
        ])->assertCreated()->assertJsonPath('data.isAdmin', true);

        $this->assertDatabaseHas('users', ['florr_id' => 'Xyiw46_', 'is_admin' => true]);
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

    public function test_invalid_credentials_are_rejected(): void
    {
        User::factory()->create(['florr_id' => 'player-id']);

        $this->postJson('/api/login', [
            'florrId' => 'player-id',
            'password' => 'incorrect-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('florrId');
    }
}
