<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Tests\TestCase;

class SecurityBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_non_auth_api_route_requires_sanctum_authentication(): void
    {
        $publicApiRoutes = [
            'POST api/login',
            'POST api/register',
        ];

        $routes = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn (Route $route): bool => str_starts_with($route->uri(), 'api/'));

        foreach ($routes as $route) {
            $routeKey = $route->methods()[0].' '.$route->uri();
            if (in_array($routeKey, $publicApiRoutes, true)) {
                continue;
            }

            $this->assertContains('auth:sanctum', $route->middleware(), $routeKey.' must require auth:sanctum.');
        }
    }

    public function test_private_local_storage_routes_are_not_exposed(): void
    {
        $uris = collect(app('router')->getRoutes()->getRoutes())
            ->map(fn (Route $route): string => $route->uri());

        $this->assertNotContains('storage/{path}', $uris);
        $this->put('/storage/security-probe', ['content' => 'blocked'])->assertNotFound();
    }

    public function test_admin_api_rejects_authenticated_non_admin_users(): void
    {
        $this->actingAs(User::factory()->create(['is_admin' => false]))
            ->getJson('/api/admin/users')
            ->assertForbidden();
    }
}
