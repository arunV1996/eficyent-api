<?php

namespace App\Http\Middleware\Api;

use Closure;
use Illuminate\Http\Request;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class MakerAccess
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth('team')->user();

        if (!in_array($user->permission, [TEAM_MEMBER_PERMISSION_MAKER, TEAM_MEMBER_PERMISSION_MAKER_CHECKER, TEAM_MEMBER_PERMISSION_INITIATOR])) {

            return response()->json([
                'success' => false,
                'error' => api_error(133),
                'error_code' =>   133,
            ], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
