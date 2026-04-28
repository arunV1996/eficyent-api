<?php

namespace App\Http\Middleware\Api;

use Closure;
use Illuminate\Http\Request;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class EmailShouldBeVerified
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user->email_verified_at) {

            return response()->json([
                'success' => false,
                'error' => api_error(107),
                'error_code' =>   107,
            ], 200);
        }

        return $next($request);
    }
}
