<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['middleware' => ['web', 'auth:sanctum', 'throttle:broadcast']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->redirectGuestsTo(fn (): null => null);
        $middleware->trustProxies(at: ['127.0.0.1', '::1']);
        $middleware->append(\App\Http\Middleware\AddSecurityHeaders::class);
        $middleware->alias([
            'not_banned' => \App\Http\Middleware\EnsureUserIsNotBanned::class,
            'admin' => \App\Http\Middleware\EnsureUserIsAdmin::class,
            'florr_verified' => \App\Http\Middleware\EnsureFlorrIsVerified::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
