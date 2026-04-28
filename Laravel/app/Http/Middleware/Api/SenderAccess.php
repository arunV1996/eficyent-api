<?php

namespace App\Http\Middleware\Api;

use Closure;
use Illuminate\Http\Request;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class SenderAccess
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if($user->user_type == USER_TYPE_BUSINESS && $user->enable_sender == ACTIVE){

            return $next($request);
        }

        return response()->json([
            'success' => false,
            'error' => api_error(133),
            'error_code' =>   133,
        ], Response::HTTP_UNAUTHORIZED);
    }
}
