@component('mail::message')
# {{ tr('user_registered_email_greeting') }}

{{ tr('user_registered_email_thank_you', ['site_name' => Setting::get('site_name')]) }}

{{ tr('user_registered_email_verification_instruction') }}

@component('mail::panel')
# {{ $user->email_code }}
@endcomponent

{{ tr('user_registered_email_enter_code_hint') }}

{{ tr('user_registered_email_code_validity_notice', ['email_code_expiry_minutes' => Setting::get('email_code_expiry_minutes', 10)]) }}

{{ tr('user_registered_email_ignore_if_not_requested') }}

Thanks,  
The {{ Setting::get('site_name') }} Team
@endcomponent