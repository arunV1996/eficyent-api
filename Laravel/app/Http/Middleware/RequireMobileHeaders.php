<?php

namespace App\Http\Middleware;

use Closure;
use Exception;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireMobileHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        try {

            if ($request->getHost() === env('MOBILE_SERVER_URL')) {

                throw_if(!$request->header('x-mobile-secret') || !$request->header('genesis'), new Exception(api_error(182), 182));

                throw_if($request->header('x-mobile-secret') != env('MOBILE_SECRET'), new Exception(api_error(183), 183));

                throw_if($request->header('genesis') != env('MOBILE_GENESIS'), new Exception(api_error(184), 184));
            }

            return $next($request);
        } catch (Exception $e) {

            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'error_code' => $e->getCode()
            ], 200);
        }
    }
}
