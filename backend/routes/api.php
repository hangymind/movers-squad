<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\TeamController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/user', fn (Request $request) => new UserResource($request->user()));
    Route::patch('/user', [AuthController::class, 'updateProfile'])->middleware('throttle:write');
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/teams', [TeamController::class, 'index'])->middleware('throttle:read');
    Route::post('/teams', [TeamController::class, 'store'])->middleware('throttle:write');
    Route::post('/teams/{teamId}/join', [TeamController::class, 'join'])->middleware('throttle:write');
    Route::delete('/teams/{teamId}/members/me', [TeamController::class, 'leave'])->middleware('throttle:write');
    Route::post('/teams/{teamId}/close', [TeamController::class, 'close'])->middleware('throttle:write');
});
