<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(20)->by('login-ip|'.$request->ip()),
            Limit::perMinute(5)->by('login-id|'.$this->identityKey($request)),
        ]);
        RateLimiter::for('register', fn (Request $request) => [
            Limit::perHour(5)->by('register-ip|'.$request->ip()),
            Limit::perHour(2)->by('register-id|'.$this->identityKey($request)),
        ]);
        RateLimiter::for('read', fn (Request $request) => [
            Limit::perMinute(180)->by('read-user|'.($request->user()?->id ?? 'guest')),
            Limit::perMinute(300)->by('read-ip|'.$request->ip()),
        ]);
        RateLimiter::for('write', fn (Request $request) => [
            Limit::perMinute(30)->by('write-user|'.($request->user()?->id ?? 'guest')),
            Limit::perMinute(60)->by('write-ip|'.$request->ip()),
        ]);
        RateLimiter::for('team-action', fn (Request $request) => [
            Limit::perMinute(10)->by('team-user|'.$request->user()->id),
            Limit::perMinute(30)->by('team-ip|'.$request->ip()),
        ]);
        RateLimiter::for('chat', fn (Request $request) => [
            Limit::perMinute(30)->by('chat-user|'.$request->user()->id),
            Limit::perMinute(90)->by('chat-ip|'.$request->ip()),
        ]);
        RateLimiter::for('voice', fn (Request $request) => [
            Limit::perMinute(12)->by('voice-user|'.$request->user()->id),
            Limit::perMinute(36)->by('voice-ip|'.$request->ip()),
        ]);
        RateLimiter::for('upload', fn (Request $request) => [
            Limit::perHour(3)->by('upload-user|'.$request->user()->id),
            Limit::perHour(10)->by('upload-ip|'.$request->ip()),
        ]);
        RateLimiter::for('broadcast', fn (Request $request) => [
            Limit::perMinute(60)->by('broadcast-user|'.$request->user()->id),
            Limit::perMinute(180)->by('broadcast-ip|'.$request->ip()),
        ]);
        RateLimiter::for('admin-read', fn (Request $request) => Limit::perMinute(120)->by('admin-read|'.$request->user()->id));
        RateLimiter::for('admin-write', fn (Request $request) => Limit::perMinute(30)->by('admin-write|'.$request->user()->id));
    }

    private function identityKey(Request $request): string
    {
        return hash('sha256', strtolower((string) $request->input('florrId')).'|'.$request->ip());
    }
}
