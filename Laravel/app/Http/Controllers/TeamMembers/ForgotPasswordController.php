<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Team\Auth\ForceResetPasswordRequest;
use App\Http\Requests\Team\Password\ForgotPasswordRequest;
use App\Http\Requests\Team\Password\ResetPasswordRequest;
use App\Http\Requests\Team\Password\VerifyCodeRequest;
use App\Models\PasswordReset;
use App\Models\TeamMember;
use App\Services\Email\UserAuthEmailService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Akaunting\Setting\Facade as Setting;
use App\Services\Email\TeamAuthEmailService;

class ForgotPasswordController extends Controller
{
    /**
     * Force reset team member password.
     * 
     * This endpoint is used to force reset team member password.
     * 
     * @param ForceResetPasswordRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function force_reset_password(ForceResetPasswordRequest $request)
    {

        try {

            $validated = $request->validated();

            $user = TeamMember::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if($user->last_password_reset, new Exception(api_error(161), 161));

            throw_if(Hash::check($validated['password'], $user->password), new Exception(api_error(126), 126));

            $user->update([
                'password' => Hash::make($validated['password']),
                'last_password_reset' => now()
            ]);

            $token = $user->createToken('team_member_token', [AUTHENTICATION_ABILITY])->plainTextToken;

            $data['access_token'] = $token;

            return $this->sendResponse(api_success(111), 111, $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function send_reset_link(ForgotPasswordRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = TeamMember::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            $user->update([
                'email_code' => generateEmailCode(),
                'email_code_expiry' => generateEmailCodeExpiry()
            ]);

            TeamAuthEmailService::forgot_password($user);

            $data['email'] = $user->email;

            return $this->sendResponse(api_success(109), 109, $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function verify_code(VerifyCodeRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = TeamMember::where('email', $validated['email'])->first();

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

                    if ($attempts >= 5) {

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

    public function reset_password(ResetPasswordRequest $request)
    {
        try {

            $validated = $request->validated();

            $password_reset = PasswordReset::where('token', $validated['reset_token'])->first();

            throw_if(!$password_reset, new Exception(api_error(128), 128));

            $expiry_time = Setting::get('password_reset_expiry', 60);

            throw_if($password_reset->created_at->addMinutes($expiry_time)->isPast(), new Exception(api_error(141), 141));

            $user = TeamMember::where('email', $password_reset->email)->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            DB::transaction(function () use ($user, $password_reset, $validated) {

                $user->update([
                    'password' => Hash::make($validated['password']),
                    'last_password_reset' => now()
                ]);

                PasswordReset::where('token', $validated['reset_token'])->delete();
            });

            return $this->sendResponse(api_success(111), 111, []);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
