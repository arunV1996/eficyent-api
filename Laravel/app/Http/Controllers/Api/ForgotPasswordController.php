<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Http\Requests\Auth\VerifyCodeRequest;
use App\Models\PasswordReset;
use App\Models\User;
use App\Services\Email\UserAuthEmailService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Akaunting\Setting\Facade as Setting;

class ForgotPasswordController extends Controller
{
    /**
     * Sends a reset password link to the user.
     *
     * @param ForgotPasswordRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function send_reset_link(ForgotPasswordRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = User::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            $user->update([
                'email_code' => generateEmailCode(),
                'email_code_expiry' => generateEmailCodeExpiry()
            ]);

            UserAuthEmailService::forgot_password($user);

            $data['email'] = $user->email;

            return $this->sendResponse(api_success(109), 109, $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Verify the verification code sent to the user.
     * 
     * @param VerifyCodeRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function verify_code(VerifyCodeRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = User::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            $email = $validated['email'];

            $attemptKey = "email_attempts_{$email}";
            
            $blockedKey = "email_blocked_{$email}";

            if (cache()->has($blockedKey)) {

                throw new Exception(api_error(134), 134);
            }

            if (!config('app.is_sandbox')) {

                if ($user->email_code !== $validated['verification_code']) {

                    $attempts = cache()->increment($attemptKey);

                    cache()->put($attemptKey, $attempts, now()->addMinutes(10));

                    if ($attempts >= 10) {

                        cache()->put($blockedKey, true, now()->addMinutes(30));
                    }

                    throw new Exception(api_error(142), 142);
                }
            }

            cache()->forget($attemptKey);

            $token = DB::transaction(function () use ($user) {

                $token = app('auth.password.broker')->createToken($user);

                PasswordReset::where('email', $user->email)->delete();

                PasswordReset::create([
                    'email' => $user->email,
                    'token' => $token,
                    'created_at' => now()
                ]);

                $user->update([
                    'email_code' => null,
                    'email_code_expiry' => null
                ]);

                return $token;
            });

            $data = [
                'reset_token' => $token,
                'email' => $user->email
            ];

            return $this->sendResponse(api_success(110), 110, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
    /**
     * Reset user password.
     *
     * This endpoint is used to reset user password.
     *
     * @param ResetPasswordRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function reset_password(ResetPasswordRequest $request)
    {
        try {

            $validated = $request->validated();

            $password_reset = PasswordReset::where('token', $validated['reset_token'])->first();

            throw_if(!$password_reset, new Exception(api_error(128), 128));

            $expiry_time = Setting::get('password_reset_expiry', 60);

            throw_if($password_reset->created_at->addMinutes($expiry_time)->isPast(), new Exception(api_error(141), 141));

            $user = User::where('email', $password_reset->email)->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            DB::transaction(function () use ($user, $password_reset, $validated) {

                $user->update([
                    'password' => Hash::make($validated['password'])
                ]);

                PasswordReset::where('token', $validated['reset_token'])->delete();
            });

            return $this->sendResponse(api_success(111), 111, []);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
