<?php

namespace App\Http\Controllers;

use App\Http\Resources\FlorrBindingApplicationResource;
use App\Http\Resources\UserResource;
use App\Models\FlorrBindingApplication;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class FlorrBindingController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'screenshot' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);

        $file = $request->file('screenshot');
        $path = $file->store('florr-bindings', 'local');
        abort_if($path === false, 500, '截图保存失败，请稍后重试。');

        try {
            $application = DB::transaction(function () use ($request, $file, $path): FlorrBindingApplication {
                $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
                abort_if($user->florr_verified_at !== null, 409, '该账户已经完成绑定。');
                abort_if($user->florrBindingApplications()->where('status', FlorrBindingApplication::STATUS_PENDING)->exists(), 409, '你已有一份申请正在审批。');
                abort_if($user->florrBindingApplications()->whereNotNull('reviewed_at')->whereNull('result_seen_at')->exists(), 409, '请先确认上一次申请的审批结果。');

                return $user->florrBindingApplications()->create([
                    'status' => FlorrBindingApplication::STATUS_PENDING,
                    'screenshot_path' => $path,
                    'screenshot_mime' => $file->getMimeType(),
                    'screenshot_size' => $file->getSize(),
                ]);
            });
        } catch (Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }

        $user = $request->user()->refresh()->load('latestFlorrBinding');

        return response()->json([
            'application' => (new FlorrBindingApplicationResource($application))->resolve($request),
            'user' => (new UserResource($user))->resolve($request),
        ], 201);
    }

    public function acknowledge(Request $request, FlorrBindingApplication $application): JsonResponse
    {
        abort_unless($application->user_id === $request->user()->id, 403);
        abort_if($application->reviewed_at === null, 409, '该申请尚未完成审批。');

        if ($application->result_seen_at === null) {
            $application->update(['result_seen_at' => now()]);
        }

        return response()->json(null, 204);
    }
}
