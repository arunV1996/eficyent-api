<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    /**
     * Get the path the user should be redirected to when they are not authenticated.
     */
    protected function redirectTo(Request $request): ?string
    {

        if ($request->is('api/*')) {
         
            return response()->json([
                'success' => false,
                'error' => api_error(101), 
                'error_code' => 401,
            ], 401);
            
        }

        return $request->expectsJson() ? null : route('login');
    }
}
