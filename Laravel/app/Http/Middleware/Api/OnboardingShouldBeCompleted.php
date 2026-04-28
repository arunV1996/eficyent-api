<?php

namespace App\Http\Middleware\Api;

use Closure;
use Illuminate\Http\Request;
use stdClass;
use Symfony\Component\HttpFoundation\Response;

class OnboardingShouldBeCompleted
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user->onboarding_step != ONBOARDING_STEP_FOUR_COMPLETED) {

            return response()->json([
                'success' => false,
                'error' => api_error(114),
                'error_code' =>   114,
            ], 200);
        }

        return $next($request);
    }
}
