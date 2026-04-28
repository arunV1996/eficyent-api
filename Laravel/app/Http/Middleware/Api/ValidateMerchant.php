<?php

namespace App\Http\Middleware\Api;

use App\Models\Merchant;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class ValidateMerchant
{
    public function handle(Request $request, Closure $next)
    {
        try {
            $merchantId = $request->header('X-Merchant-Id');

            $user = $request->user();

            $merchant = null;

            if ($merchantId) {

                $merchant = Merchant::where('unique_id', $merchantId)->first();

                if ($merchant->type == MERCHANT_TYPE_PAYINCOLLECTION || $merchant->type == MERCHANT_TYPE_PAYOUTINTEGRATOR) {

                    $user_id = $request->header('X-User-Id');

                    throw_if(!$user_id, new \Exception(api_error(192), 192));

                    $user = User::where('unique_id', $user_id)
                        ->where('merchant_id', $merchant->id)
                        ->first();

                    throw_if(!$user, new \Exception(api_error(193), 193));

                    Auth::setUser($user);
                }
            }
            return $next($request);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'error_code' => $e->getCode(),
            ], Response::HTTP_UNAUTHORIZED);
        }
    }
}
