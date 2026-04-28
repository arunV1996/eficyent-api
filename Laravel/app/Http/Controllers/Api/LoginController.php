<?php

namespace App\Http\Controllers\Api;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\TfaLoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Exception;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class LoginController extends Controller
{
    /**
     * Login with email and password.
     *
     * @param  LoginRequest  $request
     *
     * @return  JsonResponse
     *
     * @throws  Exception
     */
    public function login(LoginRequest $request)
    {
        try {

            $validated = $request->validated();

            throw_if(!Auth::attempt($request->only(['email', 'password'])), new Exception(api_error(125), 125));

            $user = Auth::user();

            $user->update([
                'device_id' => $validated['device_id'] ?? null,
                'device_type' => $validated['device_type'] ?? null
            ]);

            $merchantHeader = $request->header('X-Merchant-Id');

            if ($user->merchant_id && $merchantHeader) {

                if ($user->merchant->unique_id !== $merchantHeader) {
                    return $this->sendError(api_error(151), 151, 401);
                }

                if ($user->merchant->type == MERCHANT_TYPE_PAYOUT || $user->merchant->type == MERCHANT_TYPE_PAYINCOLLECTION) {

                    $token = Helper::create_merchant_bearer($user);

                    $data['access_token'] = $token['access_token'];

                    $data['expires_at']   = $token['expires_at'];

                    $data['expires_in']   = $token['expires_in'];

                    return $this->sendResponse('', 104, $data);
                }
            }

            $data['user'] = new UserResource($user, METHOD_LOGIN);

            if (!$user->is_tfa_enabled) {

                $data['access_token'] = Helper::create_bearer($user);
            }

            return $this->sendResponse(api_success(104), 104, $data);

        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Login with TFA.
     *
     * @param  TfaLoginRequest  $request
     *
     * @return  JsonResponse
     *
     * @throws  Exception
     */
    public function tfaLogin(TfaLoginRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = User::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if(!$user->is_tfa_enabled, new Exception(api_error(140), 140));

            throw_if(!Helper::verifyTfaCode($user, $validated['verification_code']), new Exception(api_error(139), 139));

            $data['user'] = new UserResource($user, METHOD_LOGIN);

            $data['access_token'] = Helper::create_bearer($user);

            return $this->sendResponse(api_success(104), 104, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Logout user.
     *
     * @param Request $request
     *
     * @return JsonResponse
     *
     * @throws Exception
     */
    public function logout(Request $request): JsonResponse
    {
        try {

            $user = $request->user();

            throw_if(!$user, new Exception(api_error(102), 102));

            $user->currentAccessToken()->delete();

            $user->update([
                'private_key' => null,
                'public_key' => null
            ]);

            return $this->sendResponse(api_success(105), 105);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
