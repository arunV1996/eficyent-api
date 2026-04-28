<?php

namespace App\Http\Controllers;

use Illuminate\Support\Str;
use Illuminate\Http\JsonResponse;
use Illuminate\Foundation\Bus\DispatchesJobs;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;

class Controller extends BaseController
{
    use AuthorizesRequests, DispatchesJobs, ValidatesRequests;

    public function sendResponse($message = '', $success_code = 200, $result = []): JsonResponse
    {

        info(request()->fullUrl() . " | Message : $message | Success Code : $success_code");

        $response = ['success' => true, 'message' => $message, 'code' => $success_code, 'data' => $result ?: new \stdClass()];

        return response()->json($response, 200);
    }

    public function sendError($error, $error_code = 200, $httpStatus = 200): JsonResponse
    {

        info(request()->fullUrl() . " | Error : $error | Error Code : $error_code");

        $response = [
            'success' => false,
            'error' => Str::contains($error, [
                "Forbidden",
                "forbidden",
                'x-program-id',
                'Internal server error',
                'curl error',
                'cURL error',
                'Endpoint request timed out',
                'Expecting value: line 1 column 1 (char 0)',
                'Invalid Token',
                'Impossible to create the root directory',
                'SQLSTATE[',
            ]) ? tr('something_went_wrong') : $error,
            'error_code' => $error_code
        ];

        return response()->json($response, $httpStatus);
    }
}
