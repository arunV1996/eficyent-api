<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class VerifyFVBankSignature
{
    public function handle(Request $request, Closure $next)
    {
        $signature = $request->header('x-signature');

        $data = $request->all();

        $secret = config('services.fv_bank_micro.client_secret');

        $payload = json_encode($data, JSON_UNESCAPED_SLASHES);

        $hash = hash_hmac('sha256', $payload, $secret);

        if (!$signature || !$data || !$secret) {

            Log::warning('FVBank Webhook: Invalid signature prerequisites');

            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $payload = json_encode($data, JSON_UNESCAPED_SLASHES);

        $hash    = hash_hmac('sha256', $payload, $secret);

        if (!hash_equals($hash, $signature)) {

            Log::warning('FVBank Webhook: Signature mismatch');

            return response()->json(['error' => api_error(181)], 181);
        }

        return $next($request);
    }
}
