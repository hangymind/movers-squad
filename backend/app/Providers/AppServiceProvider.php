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
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(10)->by(strtolower((string) $request->input('florrId')).'|'.$request->ip()));
        RateLimiter::for('read', fn (Request $request) => Limit::perMinute(120)->by(($request->user()?->id ?? 'guest').'|'.$request->ip()));
        RateLimiter::for('write', fn (Request $request) => Limit::perMinute(30)->by(($request->user()?->id ?? 'guest').'|'.$request->ip()));
    }
}
