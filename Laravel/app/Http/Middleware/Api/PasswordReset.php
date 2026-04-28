<?php

namespace App\Http\Middleware\Api;

use Closure;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class PasswordReset
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth('team')->user();

        throw_if(!$user, new Exception(api_error(102), 102));

        if (!$user->last_password_reset) {

            return response()->json([
                'success' => false,
                'error' => api_error(133),
                'error_code' =>   133,
            ], Response::HTTP_UNAUTHORIZED);
        }

        App::instance('team_member_id', $user->id);

        return $next($request);

    }
}
