@component('mail::message')
# {{ tr('email_verification_greeting') }}

{{ tr('email_verification_intro', ['site_name' => Setting::get('site_name')]) }}

{{ tr('email_verification_instruction') }}

@component('mail::panel')
# {{ $user->email_code }}
@endcomponent

{{ tr('email_verification_note') }}

{{ tr('email_verification_code_validity', ['email_code_expiry_minutes' => Setting::get('email_code_expiry_minutes', 10)]) }}

{{ tr('email_verification_ignore_notice') }}

Thanks,  
The {{ Setting::get('site_name') }} Team
@endcomponent
