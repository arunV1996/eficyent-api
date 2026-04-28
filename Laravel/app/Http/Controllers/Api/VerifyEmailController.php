<?php

namespace App\Http\Controllers\Api;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SendOtpRequest;
use App\Http\Requests\Auth\VerifyOtpRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Email\UserAuthEmailService;
use Exception;
use Illuminate\Http\Request;

class VerifyEmailController extends Controller
{
    /**
     * Verify the OTP sent to the user.
     * 
     * @param  VerifyOtpRequest  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function verifyOtp(VerifyOtpRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = User::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            if (!config('app.is_sandbox')) {

                throw_if($validated['otp'] != $user->email_code, new Exception(api_error(103), 103));

                throw_if($user->email_code_expiry < time(), new Exception(api_error(104), 104));
            }

            $user->update([
                'email_code' => null,
                'email_code_expiry' => null,
                'email_verified_at' => now()
            ]);

            $data['user'] = new UserResource($user, METHOD_VERIFY_EMAIL);

            $data['access_token'] = Helper::create_bearer($user);

            UserAuthEmailService::email_verified($user);

            return $this->sendResponse(api_success(102), 102, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Resend the OTP sent to the user.
     * 
     * @return JsonResponse
     * @throws Exception
     */
    public function resendOtp(SendOtpRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = User::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if($user->email_verified_at, new Exception(api_error(106), 106));

            UserAuthEmailService::email_verification_code($user);

            return $this->sendResponse(api_success(103), 103);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
