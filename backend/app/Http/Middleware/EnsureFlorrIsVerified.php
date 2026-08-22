<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureFlorrIsVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_if($request->user()->florr_verified_at === null, 403, '请先完成 Florr 账户绑定。');

        return $next($request);
    }
}
