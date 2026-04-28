@component('mail::message')
# {{ tr('email_verified_title') }}

{{ tr('email_verified_greeting') }}

{{ tr('email_verified_body') }}

{{ tr('email_verified_warning') }}

Thanks,  
The {{ Setting::get('site_name') }} Team
@endcomponent
