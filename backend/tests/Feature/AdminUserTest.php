<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_ban_search_unban_and_reset_a_user_password(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $user = User::factory()->create(['florr_id' => 'target-florr']);

        $ban = $this->actingAs($admin)->postJson("/api/admin/users/{$user->id}/ban")
            ->assertOk()->assertJsonPath('data.isBanned', true);
        $banId = $ban->json('data.banId');
        $this->assertStringStartsWith('BAN-', $banId);

        $this->actingAs($admin)->getJson('/api/admin/users?search='.$banId)
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $user->id);

        $this->actingAs($user->refresh())->getJson('/api/teams')->assertForbidden()->assertJsonPath('banId', $banId);
        $this->actingAs($admin)->postJson("/api/admin/users/{$user->id}/unban")->assertOk()->assertJsonPath('data.isBanned', false);
        $this->actingAs($admin)->patchJson("/api/admin/users/{$user->id}/password", ['password' => 'replacement-password'])->assertOk();
        $this->assertTrue(Hash::check('replacement-password', $user->refresh()->password));
    }

    public function test_non_admin_cannot_access_admin_users(): void
    {
        $this->actingAs(User::factory()->create())->getJson('/api/admin/users')->assertForbidden();
    }
}
