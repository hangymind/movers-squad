<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'florrId' => ['required', 'string', 'max:64', 'regex:/^[\pL\pN_.:-]+$/u', 'unique:users,florr_id'],
            'level' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed'],
        ]);

        $user = User::create([
            'username' => bin2hex(random_bytes(16)),
            'florr_id' => $data['florrId'],
            'level' => $data['level'] ?? 1,
            'password' => $data['password'],
            'avatar_url' => null,
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function updateProfile(Request $request): UserResource
    {
        $data = $request->validate([
            'avatarUrl' => ['sometimes', 'nullable', 'url:http,https', 'max:2048'],
            'level' => ['sometimes', 'integer', 'min:1', 'max:1000'],
        ]);
        $updates = [];
        if (array_key_exists('avatarUrl', $data)) $updates['avatar_url'] = $data['avatarUrl'];
        if (array_key_exists('level', $data)) $updates['level'] = $data['level'];
        $request->user()->update($updates);
        return new UserResource($request->user()->refresh());
    }

    public function login(Request $request): UserResource
    {
        $data = $request->validate([
            'florrId' => ['required', 'string', 'max:64'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt(['florr_id' => $data['florrId'], 'password' => $data['password']])) {
            throw ValidationException::withMessages([
                'florrId' => ['Florr ID 或密码不正确。'],
            ]);
        }

        $request->session()->regenerate();

        return new UserResource($request->user());
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        Auth::forgetGuards();

        return response()->json(null, 204);
    }
}
