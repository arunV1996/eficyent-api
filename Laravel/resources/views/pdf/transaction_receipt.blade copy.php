<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Invoice | {{$invoice_details['unique_id']}}</title>
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
            margin: 30px;
            padding: 0;
            margin: 0;
            line-height: 1;
        }

        .statement {
            max-width: 800px;
            margin: 0 auto;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        table {
            width: 100%;
            border-collapse: collapse;
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
                <p style="font-size: 16px;font-weight: 300;">
                    <strong style="color: #111111;"> Transaction Details</strong>
                </p>
            </td>
            <td align="right">
                <img src="https://cms-efibank-staging.rare-able.com/storage/uploads/sites/eac82acde974b764be7a5849e795dd4bad81afe0.png" alt="logo" width="210" height="50">
            </td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:10px;padding-bottom: 10px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="padding-top: 20px;">
                <table>
                    <tr>
                        <td>
                            <p style="font-size: 16px;font-weight: 300;color: #111111;text-align: left;padding-bottom: 15px;">
                                <strong>
                                    Invoice Details
                                </strong>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p
                                style="font-size: 18px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 10px;">
                               {{ $invoice_details['name'] ?? '--' }}
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p
                                style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 10px;">
                                {{ $invoice_details['created_at'] ?? '--' }}
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <p
                                style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 10px;">
                                Transaction ID : {{ $invoice_details['unique_id'] ?? '--' }}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:15px;padding-bottom: 15px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td>
                <p style="font-size: 20px;font-weight: 300;color: #777777;padding-top: 20px;">
                    <strong style="color: #111111;"> Transfer Overview</strong>
                </p>
            </td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:10px;padding-bottom: 10px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="padding-top: 30px;">
                <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 15px;">Transfered Amount
                </p>
                <strong style="font-size: 15px;color: #111111;text-align: left;">{{$invoice_details['sending_currency'] ?? ''}} {{ $invoice_details['amount'] ?? '--'}}</strong>
            </td>
            <td style="padding-top: 30px;">
                <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 15px;">Purpose of Payment
                </p>
                <strong style="font-size: 15px; color: #111111; text-align: left;">
                    {{ $invoice_details['purpose_of_payment'] ?? '--' }}
                </strong>

            </td>
        </tr>
        <tr>
            <td style="padding-top: 30px;">
                <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 15px;">
                    FX Rate
                </p>
                <strong style="font-size: 15px; color: #111111; text-align: left;">
                    {{ $invoice_details['fx_rate'] ?? '--' }}
                </strong>

            </td>
            <td style="padding-top: 20px;">
                <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 15px;">Customer Remark
                </p>
                <strong style="font-size: 15px;color: #111111;text-align: left;">{{ $invoice_details['remarks'] ?? '--'}}</strong>
            </td>
        </tr>
        <tr>
            <td style="padding-top: 20px;">
                <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 15px;">Transaction Status
                </p>
                <strong style="font-size: 15px;color: #111111;text-align: left;">{{ $invoice_details['status'] ?? '--'}}</strong>
            </td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:20px;padding-bottom: 15px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td>
                <p style="font-size: 20px;font-weight: 300;color: #777777;padding-top: 20px;">
                    <strong style="color: #111111;">Recipient Details</strong>
                </p>
            </td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="border-bottom:1px solid #eaeaea; padding-top:10px;padding-bottom: 10px;"></td>
        </tr>
    </table>
    <table>
        <tr>
            <td style="padding-top: 30px;">
                <table>
                    <tr>
                        <td>
                            <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 20px;">
                                <strong style="color: #111111;">Name: </strong> {{ $invoice_details['beneficiary_name'] ?? '--'}}
                            </p>
                        </td>
                        <td>
                            <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;">
                                <strong style="color: #111111;">Account Number: </strong> {{ $invoice_details['account_number'] ?? '--'}}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <p style="font-size: 14px;font-weight: 300;color: #777777;text-align: left;padding-bottom: 20px;">
                                <strong style="color: #111111;">Bank Code: </strong> {{ $invoice_details['bank_code'] ?? '--'}}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    <table bgcolor="#0176FF" style="background-color: #0176FF; margin-top: 40px;">
        <tr>
            <td style="padding:20px;" align="center">
                <p style="font-size: 14px;font-weight: 300;color: #111111;">
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