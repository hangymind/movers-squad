<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class AdminUserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:64']]);
        $search = trim($data['search'] ?? '');
        $users = User::query()
            ->when($search !== '', fn ($query) => $query->where(fn ($nested) => $nested
                ->where('florr_id', 'like', "%{$search}%")
                ->orWhere('ban_id', 'like', "%{$search}%")))
            ->latest()->limit(100)->get();
        return UserResource::collection($users);
    }

    public function ban(Request $request, User $user): UserResource
    {
        abort_if($user->is_admin, 422, '不能封禁管理员账号。');
        if ($user->banned_at === null) {
            do { $banId = 'BAN-'.Str::upper(Str::random(10)); } while (User::where('ban_id', $banId)->exists());
            $user->update(['banned_at' => now(), 'ban_id' => $banId]);
        }
        return new UserResource($user->refresh());
    }

    public function unban(User $user): UserResource
    {
        $user->update(['banned_at' => null]);
        return new UserResource($user->refresh());
    }

    public function updatePassword(Request $request, User $user): UserResource
    {
        $data = $request->validate(['password' => ['required', 'string', 'min:8', 'max:72']]);
        $user->update(['password' => $data['password']]);
        return new UserResource($user->refresh());
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_if($request->user()->is($user), 422, '不能删除当前管理员账号。');
        $user->delete();
        return response()->json(null, 204);
    }
}
