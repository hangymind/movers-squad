<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_repeated_login_attempts_are_limited_by_identity_and_ip(): void
    {
        User::factory()->create(['florr_id' => 'rate-limit-user']);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/login', [
                'florrId' => 'rate-limit-user',
                'password' => 'wrong-password',
            ])->assertUnprocessable();
        }

        $this->postJson('/api/login', [
            'florrId' => 'rate-limit-user',
            'password' => 'wrong-password',
        ])->assertTooManyRequests();
    }
}
