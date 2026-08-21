<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserIsNotBanned
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->banned_at !== null) {
            return response()->json(['message' => '您的账号已被封禁。', 'banId' => $request->user()->ban_id], 403);
        }

        return $next($request);
    }
}
