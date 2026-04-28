<?php

namespace App\Http\Middleware\Api;

use App\Models\Merchant;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class CaptureMerchantId
{
    public function handle(Request $request, Closure $next)
    {
        $merchantId = $request->header('X-Merchant-Id');

        $user = $request->user();

        $merchant = null;

        if ($merchantId) {

            $merchant = Merchant::where('unique_id', $merchantId)->first();

            if (!$merchant) {

                return response()->json([
                    'success' => false,
                    'error' => api_error(151),
                    'error_code' => 151,
                ], Response::HTTP_UNAUTHORIZED);
            }

            if ($merchant->status == INACTIVE) {

                return response()->json([
                    'success' => false,
                    'error' => api_error(152),
                    'error_code' => 152,
                ], Response::HTTP_UNAUTHORIZED);
            }

            if($user && $user->merchant_id && $user->merchant_id != $merchant->id){

                return response()->json([
                    'success' => false,
                    'error' => api_error(151),
                    'error_code' => 151,
                ], Response::HTTP_UNAUTHORIZED);
            }

            App::instance('merchant_id', $merchant->id);
        }


        return $next($request);
    }
}
