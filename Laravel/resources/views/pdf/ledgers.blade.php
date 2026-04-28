<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bank Statement</title>
    <style>
        html {
            padding: 0;
            margin: 0;
        }

        p {
            padding: 0;
            margin: 0;
        }

        th,
        td {
            padding: 0;
            margin: 0;
        }

        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 20px;
            padding: 0;
            margin: 0;
            line-height: 1;
        }

        .statement {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        .statement-table thead th {
            padding: 5px;
            text-align: center;
            font-size: 9px;
        }

        .statement-table tbody tr td {
            padding: 10px 5px;
            text-align: center;
            font-size: 8px;
            font-weight: 400;
            line-height: 1.4;
        }

        .statement-table tbody tr:nth-child(even) td {
            background-color: #fbfafa;
        }
    </style>
</head>

<body class="statement">
    <table bgcolor="#E3F3FE" style="background-color: #E3F3FE; width: 50%;">
        <tr>
            <td style=" padding: 10px;"></td>
        </tr>
    </table>
    <table bgcolor="#01FFD1" style="background-color: #01FFD1; width: 80%;">
        <tr>
            <td style=" padding: 10px;"></td>
        </tr>
    </table>
    <table bgcolor="#0176FF" style="background-color: #0176FF; margin-bottom: 40px;">
        <tr>
            <td style=" padding: 10px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td valign="bottom">
                <p style="font-size: 12px;font-weight: 300;color: #777777;">
                    <strong style="color: #111111;">{{tr('bank_statement')}} </strong> | {{ now()->format('m/d/Y') }}
                </p>
            </td>
            <td align="right">
                <img src="dark-logo.png" alt="logo" width="210" height="50">
            </td>
        </tr>
    </table>

    @if ($account_details)
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:15px;padding-bottom: 15px;"></td>
        </tr>
    </table>
    <table style="margin-top: 20px; ">
        <tr>
            <td valign="bottom">
                <table>
                    <tr>
                        <td>
                            <p style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 12px;">
                                <strong style="color: #111111;">{{tr('account_number')}} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->account_number ?: tr('na') }} </span>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 12px;">
                                <strong style="color: #111111;">{{ tr('account_holder') }} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->account_holder_name ?: tr('na')}}</span>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p style="font-size: 12px;font-weight: 500;color: #313131;">
                                <strong style="color: #111111;">{{ tr('currency') }} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ Str::limit($account_details->currency, 40) }} </span>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
            <td align="right">
                <table>
                    <tr>
                        <td align="right">
                            <p style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 12px;">
                                <strong style="color: #111111;">{{tr('account_bank_name')}} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->account_bank_name ?: tr('na') }} </span>
                            </p>
                        </td>
                    </tr>
                    @if($account_details->account_bank_code)
                    <tr>
                        <td align="right">
                            <p style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 12px;">
                                <strong style="color: #111111;">{{tr('bank_code')}} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->account_bank_code ?: tr('na') }} </span>
                            </p>
                        </td>
                    </tr>
                    @endif
                    @if($account_details->routing_number)
                    <tr>
                        <td align="right">
                            <p style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 12px;">
                                <strong style="color: #111111;">{{tr('routing_number')}} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->routing_number ?: tr('na') }} </span>
                            </p>
                        </td>
                    </tr>
                    @endif
                    <tr>
                        <td align="right">
                            <p style="font-size: 12px;font-weight: 500;color: #313131;">
                                <strong style="color: #111111;">{{tr('bank_address')}} : </strong> <span style="font-size: 12px;font-weight: 500;color: #313131; margin-bottom: 6px;">
                                    {{ $account_details->account_bank_address ?: tr('na') }} </span>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    @endif
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:15px;padding-bottom: 15px;"></td>
        </tr>
    </table>
    <table class="statement-table" style="margin-top: 20px;">
        <thead>
            <tr>
                <th>{{tr('s_no')}}</th>

                <th>{{tr('transaction_id')}}</th>

                <th>{{tr('client_ref_no')}}</th>

                <th>{{tr('credit')}}</th>

                <th>{{tr('debit')}}</th>

                <th>{{tr('balance')}}</th>

                <th>{{tr('date')}}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($ledger_details as $i => $export_detail)

            <tr>

                <td>{{ $i+1 }}</td>

                <td>{{ $export_detail['transaction_id'] }}</td>

                <td>{{ $export_detail['client_reference_id'] }}</td>

                <td style="color: green;">
                    @if ($export_detail['transaction_type'] == "CREDIT")
                    {{ $export_detail['amount'] }}
                    @else
                    -
                    @endif
                </td>

                <td style="color: red;">
                    @if ($export_detail['transaction_type'] == "DEBIT")
                    {{ $export_detail['amount'] }}
                    @else
                    -
                    @endif
                </td>

                <td>{{ $export_detail['balance'] }}</td>

                <td>{{ $export_detail['created_at'] }}</td>

            </tr>
            @endforeach

        </tbody>
    </table>
    <table bgcolor="#0176FF" style="background-color: #0176FF; margin-top: 40px;">
        <tr>
            <td style="padding:20px;" align="center">
                <p style="font-size: 14px;font-weight: 300;color: #fff;">
                    <strong style="color: #111111;">
                        Note:
                    </strong>
                    This is computer generated receipt and does not require physical signature.
                </p>
            </td>
        </tr>
    </table>
</body>

</html>