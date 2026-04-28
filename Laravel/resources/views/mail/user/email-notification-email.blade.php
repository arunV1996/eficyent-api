<!DOCTYPE html>
<html lang="en" style="margin: 0; padding: 0; width: 100%; background-color: #f6f6f6;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{$email_data['subject'] ?: tr('na')}}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background-color: #f6f6f6;
        }
        table {
            border-spacing: 0;
            width: 100%;
            padding: 20px;
            background-color: #ffffff;
        }
        td {
            padding: 10px;
            text-align: left;
        }
        h1, p {
            margin: 0;
        }
        .otp {
            font-size: 24px;
            font-weight: bold;
            color: #000;
            text-align: left;
        }
        @media only screen and (max-width: 600px) {
            body, table {
                width: 100%;
            }
            td {
                padding: 5px;
            }
            .otp {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <table>
        <tr>
            <td>
                <p>Hi <strong>{{$email_data['name'] ?? tr('na')}}</strong>,</p>
            </td>
            </tr>
            <tr>
            <td>
                <p  style="text-align: left;">{{ $email_data['body'] ?? tr('na')}}.</p>
               
            </td>
            </tr>
           @if(!empty($email_data['verification_code']))
            <tr>
                <td>
                    {{ tr('use_code') }} : <p class="otp" style="text-align:left;">{{ $email_data['verification_code'] }}</p>
                </td>
            </tr>
            <tr>
            <td align="left">
                <p style="color: #999;">{{tr('dont_share_otp_content')}}</p>
            </td>
            </tr>
            @endif
            @if(!empty($email_data['url']))
            <tr>
                <td>
                    <a href="{{ $email_data['url'] ?: tr('na')}}" class="otp-btn"  style="text-align:center; background: #0176FF;color: #fff;font-size:14px;font-weight:400;border:0;border-radius:8px;padding: 10px 20px;">{{tr('accept_invite_link')}}</a>
                </td>
            </tr>
            @endif
            <tr>
            <td>
                <p>{{tr('thanks')}},<br><strong>{{Setting::get('site_name')}}</strong></p>
            </td>
            </tr>
        </tr>
    </table>
</body>
</html>