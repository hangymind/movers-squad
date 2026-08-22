<?php

namespace Tests\Feature;

use App\Events\FlorrBindingReviewed;
use App\Models\FlorrBindingApplication;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FlorrBindingTest extends TestCase
{
    use RefreshDatabase;

    public function test_unverified_user_can_browse_but_cannot_create_or_join(): void
    {
        $user = User::factory()->create(['florr_verified_at' => null]);
        $owner = User::factory()->create();
        $team = $owner->ownedTeams()->create(['game_name' => 'Florr.io']);
        $team->members()->attach($owner, ['joined_at' => now()]);

        $this->actingAs($user)->getJson('/api/teams')->assertOk();
        $this->actingAs($user)->postJson('/api/teams')->assertForbidden();
        $this->actingAs($user)->postJson("/api/teams/{$team->id}/join")->assertForbidden();
    }

    public function test_user_can_submit_only_one_pending_private_screenshot(): void
    {
        Storage::fake('local');
        $user = User::factory()->create(['florr_verified_at' => null]);

        $response = $this->actingAs($user)->post('/api/florr-bindings', [
            'screenshot' => $this->pngUpload(),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()->assertJsonPath('user.florrBinding.status', 'pending');
        $application = FlorrBindingApplication::firstOrFail();
        Storage::disk('local')->assertExists($application->screenshot_path);

        $this->actingAs($user)->post('/api/florr-bindings', [
            'screenshot' => $this->pngUpload(),
        ], ['Accept' => 'application/json'])->assertConflict();
        $this->assertDatabaseCount('florr_binding_applications', 1);
    }

    public function test_upload_rejects_unsupported_and_oversized_files(): void
    {
        Storage::fake('local');
        $user = User::factory()->create(['florr_verified_at' => null]);

        $this->actingAs($user)->post('/api/florr-bindings', [
            'screenshot' => UploadedFile::fake()->create('proof.gif', 10, 'image/gif'),
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('screenshot');

        $this->actingAs($user)->post('/api/florr-bindings', [
            'screenshot' => UploadedFile::fake()->create('proof.png', 10241, 'image/png'),
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('screenshot');
    }

    public function test_admin_can_approve_and_user_can_acknowledge_persisted_result(): void
    {
        Event::fake([FlorrBindingReviewed::class]);
        Storage::fake('local');
        [$user, $admin, $application] = $this->pendingApplication();

        $this->actingAs($admin)->postJson("/api/admin/florr-bindings/{$application->id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');

        $this->assertNotNull($user->refresh()->florr_verified_at);
        $this->actingAs($user)->getJson('/api/user')
            ->assertJsonPath('data.florrBinding.resultUnread', true)
            ->assertJsonPath('data.isFlorrVerified', true);
        $this->actingAs($user)->postJson("/api/florr-bindings/{$application->id}/acknowledge")->assertNoContent();
        $this->assertNotNull($application->refresh()->result_seen_at);
        Event::assertDispatched(FlorrBindingReviewed::class);
    }

    public function test_rejection_requires_reason_deletes_image_and_allows_resubmission(): void
    {
        Event::fake([FlorrBindingReviewed::class]);
        Storage::fake('local');
        [$user, $admin, $application] = $this->pendingApplication();
        $path = $application->screenshot_path;

        $this->actingAs($admin)->postJson("/api/admin/florr-bindings/{$application->id}/reject", [])->assertUnprocessable();
        $this->actingAs($admin)->postJson("/api/admin/florr-bindings/{$application->id}/reject", ['reason' => '截图未显示背包内容。'])
            ->assertOk()->assertJsonPath('data.rejectionReason', '截图未显示背包内容。');
        Storage::disk('local')->assertMissing($path);
        $this->assertNull($user->refresh()->florr_verified_at);

        $this->actingAs($user)->postJson("/api/florr-bindings/{$application->id}/acknowledge")->assertNoContent();

        $this->actingAs($user)->post('/api/florr-bindings', [
            'screenshot' => $this->pngUpload(),
        ], ['Accept' => 'application/json'])->assertCreated();
    }

    public function test_only_admin_can_read_or_delete_approved_images_and_deletion_keeps_verification(): void
    {
        Storage::fake('local');
        [$user, $admin, $application] = $this->pendingApplication();
        $this->actingAs($admin)->postJson("/api/admin/florr-bindings/{$application->id}/approve")->assertOk();

        $this->actingAs($user)->get("/api/admin/florr-bindings/{$application->id}/image")->assertForbidden();
        $this->actingAs($admin)->get("/api/admin/florr-bindings/{$application->id}/image")->assertOk();
        $this->actingAs($admin)->deleteJson("/api/admin/florr-images/{$application->id}")->assertNoContent();

        $this->assertNull($application->refresh()->screenshot_path);
        $this->assertNotNull($user->refresh()->florr_verified_at);
    }

    public function test_admin_can_bulk_delete_approved_images(): void
    {
        Storage::fake('local');
        $admin = User::factory()->create(['is_admin' => true]);
        $applications = collect([1, 2])->map(function (): FlorrBindingApplication {
            $user = User::factory()->create();
            $path = $this->pngUpload()->store('florr-bindings', 'local');

            return $user->florrBindingApplications()->create([
                'status' => FlorrBindingApplication::STATUS_APPROVED,
                'screenshot_path' => $path,
                'screenshot_mime' => 'image/png',
                'screenshot_size' => 68,
                'reviewed_at' => now(),
            ]);
        });

        $this->actingAs($admin)->deleteJson('/api/admin/florr-images', [
            'ids' => $applications->pluck('id')->all(),
        ])->assertNoContent();

        foreach ($applications as $application) {
            $this->assertNull($application->refresh()->screenshot_path);
        }
    }

    private function pendingApplication(): array
    {
        $user = User::factory()->create(['florr_verified_at' => null]);
        $admin = User::factory()->create(['is_admin' => true]);
        $path = $this->pngUpload()->store('florr-bindings', 'local');
        $application = $user->florrBindingApplications()->create([
            'status' => FlorrBindingApplication::STATUS_PENDING,
            'screenshot_path' => $path,
            'screenshot_mime' => 'image/png',
            'screenshot_size' => 68,
        ]);

        return [$user, $admin, $application];
    }

    private function pngUpload(): UploadedFile
    {
        $content = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');

        return UploadedFile::fake()->createWithContent('florr-proof.png', $content);
    }
}
