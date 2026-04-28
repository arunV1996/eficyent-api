<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Throwable;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Validation\ValidationException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;

class Handler extends ExceptionHandler
{
    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<Throwable>>
     */
    protected $dontReport = [
        //
    ];

    /**
     * A list of the inputs that are never flashed for validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     *
     * @return void
     */
    public function register()
    {
        $this->reportable(function (Throwable $e) {
            //
        });

        $this->renderable((function (AuthorizationException $e, $request) {

            if ($request->is('api/*')) {

                return response()->json([
                    'success' => false,
                    'error' => api_error(143),
                    'error_code' => 403
                ], 401);
            }
        }));

        $this->renderable(function (AuthenticationException $e, $request) {

            if ($request->is('api/*')) {

                return response()->json([
                    'success' => false,
                    'error' => api_error(101),
                    'error_code' => 401
                ], 401);
            }
        });

        $this->renderable(function (AccessDeniedHttpException $e, $request) {

            if ($request->is('api/*')) {

                return response()->json([
                    'success' => false,
                    'error' => api_error(143),
                    'error_code' => 403
                ], 403);
            }
        });

        $this->renderable(function (ValidationException $e, $request) {

            if ($request->is('api/*')) {

                $errors = $e->errors();

                return response()->json([
                    'success' => false,
                    'error' => $errors[array_key_first($errors)][0] ?? $e->getMessage(),
                    'error_code' => 422
                ], 422);
            }
        });


        $this->renderable(function (ThrottleRequestsException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'error' => api_error(134),
                    'error_code' => 134
                ], 429);
            }
        });

        $this->renderable(function (MethodNotAllowedHttpException $e, $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'success' => false,
                    'error' => api_error(105),
                    'error_code' => 105
                ], 404);
            }
        });

         $this->renderable(function (Throwable $e, $request) {
            if ($request->is('api/*') && !config('app.debug')) {

                Log::error('Unhandled API exception', [
                    'message' => $e->getMessage(),
                    'file' => $e->getFile(),
                    'line' => $e->getLine(),
                ]);

                return response()->json([
                    'success' => false,
                    'error' => $e->getMessage() ?? 'An unexpected error occurred. Please try again later.',
                    'error_code' => 500
                ], 500);
            }
        });
    }

    protected function unauthenticated($request, AuthenticationException $exception)
    {
        if ($request->is('api/*')) {
            return response()->json([
                'success' => false,
                'error' => api_error(101),
                'error_code' => 401,
            ], 401);
        }

        return redirect()->guest(route('login'));
    }
}
