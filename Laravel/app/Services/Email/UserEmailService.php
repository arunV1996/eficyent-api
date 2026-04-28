<?php

namespace App\Services\Email;

use App\Mail\User\EmailVerifiedEmail;
use App\Models\User;
use App\Mail\User\RegisteredEmail;
use Illuminate\Support\Facades\Mail;
use App\Mail\User\VerifyEmailAddressEmail;
use Akaunting\Setting\Facade as Setting;
use App\Mail\User\ForgotPasswordEmail;
use App\Mail\User\SubuserInviteEmail;
use Illuminate\Support\Facades\Log;

class UserEmailService
{
    /**
     * Sends the registered email to the user.
     *
     * @param User $user
     * @return void
     */
    public static function user_invite_link(User $user, $invite_token)
    {
        $email_data['subject'] = tr('sub_user_invite_subject');

        $email_data['body'] = tr('sub_user_invite_body', ['site_name' => Setting::get('site_name')]);

        $email_data['name']  = "$user->first_name $user->last_name";

        $email_data['email']  = $user->email;

        $email_data['url'] = Setting::get('front_end_url') . 'accept-invite/' . $invite_token;

        Log::info($email_data);

        Mail::to($user)->send(new SubuserInviteEmail($user, $email_data));
    }
}
