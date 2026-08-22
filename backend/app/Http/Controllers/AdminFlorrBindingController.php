<?php

namespace App\Http\Controllers;

use App\Events\FlorrBindingReviewed;
use App\Http\Resources\FlorrBindingApplicationResource;
use App\Models\FlorrBindingApplication;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class AdminFlorrBindingController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['nullable', 'in:pending,approved,rejected'],
        ]);

        $applications = FlorrBindingApplication::query()
            ->with('user:id,florr_id')
            ->when(isset($data['status']), fn ($query) => $query->where('status', $data['status']))
            ->latest()
            ->paginate(20);

        return FlorrBindingApplicationResource::collection($applications);
    }

    public function pendingCount(): JsonResponse
    {
        return response()->json([
            'count' => FlorrBindingApplication::where('status', FlorrBindingApplication::STATUS_PENDING)->count(),
        ]);
    }

    public function image(FlorrBindingApplication $application): BinaryFileResponse
    {
        abort_if($application->screenshot_path === null || ! Storage::disk('local')->exists($application->screenshot_path), 404);

        return response()->file(Storage::disk('local')->path($application->screenshot_path), [
            'Content-Type' => $application->screenshot_mime ?? 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="florr-binding-'.$application->id.'"',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function approve(Request $request, FlorrBindingApplication $application): FlorrBindingApplicationResource
    {
        $reviewed = DB::transaction(function () use ($request, $application): FlorrBindingApplication {
            $locked = FlorrBindingApplication::query()->lockForUpdate()->findOrFail($application->id);
            abort_unless($locked->status === FlorrBindingApplication::STATUS_PENDING, 409, '该申请已经处理。');
            abort_if($locked->screenshot_path === null || ! Storage::disk('local')->exists($locked->screenshot_path), 422, '申请截图不存在，无法通过。');
            $user = User::query()->lockForUpdate()->findOrFail($locked->user_id);

            $locked->update([
                'status' => FlorrBindingApplication::STATUS_APPROVED,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'rejection_reason' => null,
            ]);
            $user->update(['florr_verified_at' => now()]);

            return $locked->refresh()->load('user:id,florr_id');
        });

        $this->broadcastReview($reviewed);

        return new FlorrBindingApplicationResource($reviewed);
    }

    public function reject(Request $request, FlorrBindingApplication $application): FlorrBindingApplicationResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);

        $reviewed = DB::transaction(function () use ($request, $application, $data): FlorrBindingApplication {
            $locked = FlorrBindingApplication::query()->lockForUpdate()->findOrFail($application->id);
            abort_unless($locked->status === FlorrBindingApplication::STATUS_PENDING, 409, '该申请已经处理。');
            User::query()->lockForUpdate()->findOrFail($locked->user_id);

            $this->deleteStoredImage($locked);
            $locked->update([
                'status' => FlorrBindingApplication::STATUS_REJECTED,
                'screenshot_path' => null,
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'rejection_reason' => trim($data['reason']),
                'image_deleted_at' => now(),
            ]);

            return $locked->refresh()->load('user:id,florr_id');
        });

        $this->broadcastReview($reviewed);

        return new FlorrBindingApplicationResource($reviewed);
    }

    public function images(): AnonymousResourceCollection
    {
        return FlorrBindingApplicationResource::collection(
            FlorrBindingApplication::query()
                ->with('user:id,florr_id')
                ->where('status', FlorrBindingApplication::STATUS_APPROVED)
                ->whereNotNull('screenshot_path')
                ->latest('reviewed_at')
                ->paginate(24)
        );
    }

    public function destroyImage(FlorrBindingApplication $application): JsonResponse
    {
        abort_unless($application->status === FlorrBindingApplication::STATUS_APPROVED, 422, '只能删除已通过申请的图片。');
        $this->removeImageRecord($application);

        return response()->json(null, 204);
    }

    public function destroyImages(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['integer', 'distinct'],
        ]);
        $applications = FlorrBindingApplication::query()->whereIn('id', $data['ids'])->get();
        abort_unless($applications->count() === count($data['ids']), 404);

        foreach ($applications as $application) {
            abort_unless($application->status === FlorrBindingApplication::STATUS_APPROVED, 422, '只能删除已通过申请的图片。');
        }
        foreach ($applications as $application) {
            $this->removeImageRecord($application);
        }

        return response()->json(null, 204);
    }

    private function removeImageRecord(FlorrBindingApplication $application): void
    {
        $this->deleteStoredImage($application);
        $application->update(['screenshot_path' => null, 'image_deleted_at' => now()]);
    }

    private function deleteStoredImage(FlorrBindingApplication $application): void
    {
        if ($application->screenshot_path !== null && Storage::disk('local')->exists($application->screenshot_path)) {
            abort_unless(Storage::disk('local')->delete($application->screenshot_path), 500, '图片删除失败。');
        }
    }

    private function broadcastReview(FlorrBindingApplication $application): void
    {
        try {
            FlorrBindingReviewed::dispatch($application);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
