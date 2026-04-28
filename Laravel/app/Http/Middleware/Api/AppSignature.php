<?php

namespace App\Http\Middleware\Api;

use App\Models\Merchant;
use App\Models\TeamMember;
use App\Models\User;
use Closure;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use stdClass;
use Symfony\Component\HttpFoundation\Response;
use Illuminate\Support\Str;

use function PHPSTORM_META\type;

class AppSignature
{
    /**
     * Validate the signature of the request
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return \Symfony\Component\HttpFoundation\Response
     *
     * @throws \Exception
     */
    public function handle(Request $request, Closure $next)
    {
        try {

            throw_if(!$request->header('X-Api-Key'), new Exception(api_error(110), 110));

            throw_if(!$received_signature = $request->header('X-Api-Signature'), new Exception(api_error(111), 111));

            throw_if(! $timestamp = $request->header('X-Api-Timestamp'), new Exception(api_error(128), 128));

            $requestTime = intval($timestamp);

            $currentTime = time();

            $timeDifference = abs($currentTime - $requestTime);

            // if($timeDifference > SIGNATURE_TIMESTAMP_BUFFER) {

            //     Log::warning('Request timestamp expired', [
            //         'difference_seconds' => $timeDifference,
            //         'max_allowed' => SIGNATURE_TIMESTAMP_BUFFER,
            //     ]);

            //     throw new Exception(api_error(129), 129);
            // }

            $caller = $this->resolveCaller($request);

            $model = $caller['model'];

            $type  = $caller['type'];

            $keys = $this->getKeysFromModel($model);

            $publicKeyPem = $keys['public_key'];

            $salt_key = $keys['salt_key'];

            $end_point = "/" . Str::afterLast($request->path(), "/");

            $body = $request->all();

            $body = $this->Cleanbody($body);

            $body = empty($body) ? "{}" : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $plain_content = "$end_point$body$timestamp$salt_key";

            $hmacHash = hash_hmac('sha256', $plain_content, $salt_key);

            $publicKey = openssl_pkey_get_public($publicKeyPem);

            $isValid = openssl_verify(
                $hmacHash,
                base64_decode($received_signature),
                $publicKey,
                OPENSSL_ALGO_SHA256
            );

            if ($isValid !== 1) {

                info('Signature Verification Failed', [
                    'received_signature' => $received_signature,
                    'expected_signature' => $hmacHash,
                    'plain_content'      => $plain_content,
                    'caller_type'        => $type,
                    'caller_id'          => $model->id ?? null,
                ]);

                throw new Exception(api_error(112), 112);
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

    private function resolveCaller(Request $request)
    {
        $apiKey = $request->header('X-Api-Key');

        $team = TeamMember::where('api_key', $apiKey)->first();

        if ($team) {

            return [
                'type'  => 'team',
                'model' => $team,
            ];
        }

        $merchant = Merchant::where('api_key', $apiKey)->first();

        if ($merchant) {

            return [
                'type'  => 'merchant',
                'model' => $merchant,
            ];
        }

        $user = User::where('api_key', $apiKey)->first();

        if ($user) {

            return [
                'type'  => 'user',
                'model' => $user,
            ];
        }

        throw new Exception(api_error(102), 102);
    }

    private function getKeysFromModel($model)
    {
        return [
            'public_key' => Crypt::decryptString($model->public_key),
            'salt_key'   => Str::replace(
                '"',
                '',
                Crypt::decryptString(json_encode($model->salt_key))
            ),
        ];
    }

    private function Cleanbody($body)
    {
        foreach ($body as $key => $value) {

            if ($value instanceof \Illuminate\Http\UploadedFile) {
                unset($body[$key]);
                continue;
            }

            if (is_array($value)) {
                $body[$key] = $this->Cleanbody($value);
                continue;
            }

            if (is_null($value)) {
                $body[$key] = "";
            }
        }

        if (empty($body)) {
            return new \stdClass();
        }

        return $body;
    }
}
