<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\TeamMessageController;
use App\Http\Controllers\TeamVoiceController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\AdminFlorrBindingController;
use App\Http\Controllers\AdminTeamController;
use App\Http\Controllers\FlorrBindingController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:register');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/user', fn (Request $request) => new UserResource($request->user()))->middleware('throttle:read');
    Route::patch('/user', [AuthController::class, 'updateProfile'])->middleware(['not_banned', 'throttle:write']);
    Route::patch('/user/notification-settings', [AuthController::class, 'updateNotificationSettings'])->middleware(['not_banned', 'throttle:write']);
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('throttle:write');
    Route::post('/florr-bindings', [FlorrBindingController::class, 'store'])->middleware(['not_banned', 'throttle:upload']);
    Route::post('/florr-bindings/{application}/acknowledge', [FlorrBindingController::class, 'acknowledge'])->middleware('throttle:write');

    Route::middleware('not_banned')->group(function (): void {
        Route::get('/teams', [TeamController::class, 'index'])->middleware('throttle:read');
        Route::get('/teams/current', [TeamController::class, 'current'])->middleware('throttle:read');
        Route::get('/teams/{teamId}', [TeamController::class, 'show'])->middleware('throttle:read');
        Route::post('/teams', [TeamController::class, 'store'])->middleware(['florr_verified', 'throttle:team-action']);
        Route::post('/teams/{teamId}/join', [TeamController::class, 'join'])->middleware(['florr_verified', 'throttle:team-action']);
        Route::delete('/teams/{teamId}/members/me', [TeamController::class, 'leave'])->middleware('throttle:team-action');
        Route::post('/teams/{teamId}/close', [TeamController::class, 'close'])->middleware('throttle:team-action');
        Route::get('/teams/{teamId}/messages', [TeamMessageController::class, 'index'])->middleware('throttle:read');
        Route::post('/teams/{teamId}/messages', [TeamMessageController::class, 'store'])->middleware('throttle:chat');
        Route::post('/teams/{teamId}/messages/read', [TeamMessageController::class, 'read'])->middleware('throttle:write');
        Route::post('/teams/{teamId}/voice-token', [TeamVoiceController::class, 'token'])->middleware('throttle:voice');
    });

    Route::prefix('admin')->middleware('admin')->group(function (): void {
        Route::middleware('throttle:admin-read')->group(function (): void {
            Route::get('/users', [AdminUserController::class, 'index']);
            Route::get('/florr-bindings', [AdminFlorrBindingController::class, 'index']);
            Route::get('/florr-bindings/pending-count', [AdminFlorrBindingController::class, 'pendingCount']);
            Route::get('/florr-bindings/{application}/image', [AdminFlorrBindingController::class, 'image']);
            Route::get('/florr-images', [AdminFlorrBindingController::class, 'images']);
            Route::get('/teams', [AdminTeamController::class, 'index']);
        });
        Route::middleware('throttle:admin-write')->group(function (): void {
            Route::post('/users/{user}/ban', [AdminUserController::class, 'ban']);
            Route::post('/users/{user}/unban', [AdminUserController::class, 'unban']);
            Route::patch('/users/{user}/password', [AdminUserController::class, 'updatePassword']);
            Route::delete('/users/{user}', [AdminUserController::class, 'destroy']);
            Route::post('/florr-bindings/{application}/approve', [AdminFlorrBindingController::class, 'approve']);
            Route::post('/florr-bindings/{application}/reject', [AdminFlorrBindingController::class, 'reject']);
            Route::delete('/florr-images/{application}', [AdminFlorrBindingController::class, 'destroyImage']);
            Route::delete('/florr-images', [AdminFlorrBindingController::class, 'destroyImages']);
            Route::post('/teams/{team}/close', [AdminTeamController::class, 'close']);
            Route::delete('/teams/{team}', [AdminTeamController::class, 'destroy']);
        });
    });
});
