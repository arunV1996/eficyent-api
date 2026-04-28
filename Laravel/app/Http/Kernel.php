<?php

namespace App\Http;

use App\Http\Middleware\Api\CaptureMerchantId;
use App\Http\Middleware\RequireMobileHeaders;
use Illuminate\Foundation\Http\Kernel as HttpKernel;

class Kernel extends HttpKernel
{
    /**
     * The application's global HTTP middleware stack.
     *
     * These middleware are run during every request to your application.
     *
     * @var array<int, class-string|string>
     */
    protected $middleware = [
        // \App\Http\Middleware\TrustHosts::class,
        \App\Http\Middleware\TrustProxies::class,
        \Illuminate\Http\Middleware\HandleCors::class,
        \App\Http\Middleware\PreventRequestsDuringMaintenance::class,
        \Illuminate\Foundation\Http\Middleware\ValidatePostSize::class,
        \App\Http\Middleware\TrimStrings::class,
        \Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class,
        \App\Http\Middleware\SecurityHeaders::class,
    ];

    /**
     * The application's route middleware groups.
     *
     * @var array<string, array<int, class-string|string>>
     */
    protected $middlewareGroups = [
        'web' => [
            \App\Http\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \App\Http\Middleware\VerifyCsrfToken::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
        ],

        'api' => [
            // \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class.':api',
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            'apiLogger',
            CaptureMerchantId::class,
            RequireMobileHeaders::class
        ],
    ];

    /**
     * The application's middleware aliases.
     *
     * Aliases may be used instead of class names to conveniently assign middleware to routes and groups.
     *
     * @var array<string, class-string|string>
     */
    protected $middlewareAliases = [
        'auth' => \App\Http\Middleware\Authenticate::class,
        'auth.basic' => \Illuminate\Auth\Middleware\AuthenticateWithBasicAuth::class,
        'auth.session' => \Illuminate\Session\Middleware\AuthenticateSession::class,
        'cache.headers' => \Illuminate\Http\Middleware\SetCacheHeaders::class,
        'can' => \Illuminate\Auth\Middleware\Authorize::class,
        'guest' => \App\Http\Middleware\RedirectIfAuthenticated::class,
        'password.confirm' => \Illuminate\Auth\Middleware\RequirePassword::class,
        'precognitive' => \Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests::class,
        'signed' => \App\Http\Middleware\ValidateSignature::class,
        'throttle' => \Illuminate\Routing\Middleware\ThrottleRequests::class,
        'verified' => \Illuminate\Auth\Middleware\EnsureEmailIsVerified::class,
        'email_should_be_verified' => \App\Http\Middleware\Api\EmailShouldBeVerified::class,
        'appSignature' => \App\Http\Middleware\Api\AppSignature::class,
        'apiLogger' => \App\Http\Middleware\ApiLogger::class,
        'checkTokenExpiry' => \App\Http\Middleware\Api\CheckTokenExpiry::class,
        'OnboardingShouldBeCompleted' => \App\Http\Middleware\Api\OnboardingShouldBeCompleted::class,
        'senderAccess' => \App\Http\Middleware\Api\SenderAccess::class,
        'businessUserAccess' => \App\Http\Middleware\Api\BusinessUserAccess::class,
        'nonMerchantAccess' => \App\Http\Middleware\Api\NonMerchantAccess::class,
        'onlyMerchantAccess' => \App\Http\Middleware\Api\OnlyMerchantAccess::class,
        'passwordReset' => \App\Http\Middleware\Api\PasswordReset::class,
        'ownerAccess' => \App\Http\Middleware\Api\OwnerAccess::class,
        'makerAccess' => \App\Http\Middleware\Api\MakerAccess::class,
        'checkerAccess' => \App\Http\Middleware\Api\CheckerAccess::class,
        'fvbankWebhookSignature' => \App\Http\Middleware\VerifyFVBankSignature::class,
        'ValidateMerchant' => \App\Http\Middleware\Api\ValidateMerchant::class,
    ];
}
