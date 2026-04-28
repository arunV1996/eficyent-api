<?php

namespace App\Services\Email;

use App\Mail\User\EmailVerifiedEmail;
use App\Models\User;
use App\Mail\User\RegisteredEmail;
use Illuminate\Support\Facades\Mail;
use App\Mail\User\VerifyEmailAddressEmail;
use Akaunting\Setting\Facade as Setting;
use App\Mail\User\ForgotPasswordEmail;

class UserAuthEmailService
{
    /**
     * Sends the registered email to the user.
     *
     * @param User $user
     * @return void
     */
    public static function registerd(User $user)
    {
        $user->update([
            'email_code' => generateEmailCode(),
            'email_code_expiry' => generateEmailCodeExpiry()
        ]);

        Mail::to($user)->send(new RegisteredEmail($user));
    }

    /**
     * Resends the email verification code to the user.
     *
     * @param User $user
     * @return void
     */
    public static function email_verification_code(User $user)
    {
        $user->update([
            'email_code' => generateEmailCode(),
            'email_code_expiry' => generateEmailCodeExpiry()
        ]);

        Mail::to($user)->send(new VerifyEmailAddressEmail($user));
    }

    /**
     * Sends the email verified email to the user.
     *
     * @param User $user
     * @return void
     */
    public static function email_verified(User $user)
    {
        Mail::to($user)->send(new EmailVerifiedEmail($user));
    }

    public static function forgot_password(User $user)
    {
        Mail::to($user)->send(new ForgotPasswordEmail($user));
    }
}
