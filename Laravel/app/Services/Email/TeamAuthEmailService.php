<?php

namespace App\Services\Email;

use App\Mail\User\EmailVerifiedEmail;
use App\Models\User;
use App\Mail\User\RegisteredEmail;
use Illuminate\Support\Facades\Mail;
use App\Mail\User\VerifyEmailAddressEmail;
use Akaunting\Setting\Facade as Setting;
use App\Mail\User\ForgotPasswordEmail;
use App\Mail\User\TeamForgotPasswordEmail;
use App\Models\TeamMember;

class TeamAuthEmailService
{

    public static function forgot_password(TeamMember $user)
    {
        Mail::to($user)->send(new TeamForgotPasswordEmail($user));
    }
}
