<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>{{ tr('bank_statement') }}</title>

    <style>
        table {
            font-family: Arial, sans-serif;
            border-collapse: collapse;
            width: 100%;
        }

        th {
            background-color: #187d7d;
            color: #ffffff;
            font-weight: bold;
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
        }

        td {
            border: 1px solid #dddddd;
            padding: 8px;
            text-align: center;
            font-size: 12px;
        }

        tr:nth-child(even) td {
            background-color: #f2f2f2;
        }

        .credit {
            color: green;
        }

        .debit {
            color: red;
        }
    </style>
</head>

<body>

    <table>
        <tr>
            <th>{{ tr('s_no') }}</th>
            <th>{{ tr('transaction_id') }}</th>
            <th>{{ tr('client_ref_no') }}</th>
            <th>{{ tr('credit') }}</th>
            <th>{{ tr('debit') }}</th>
            <th>{{ tr('balance') }}</th>
            <th>{{ tr('date') }}</th>
        </tr>

        @foreach ($ledger_details as $i => $ledger)
        <tr>
            <td>{{ $i + 1 }}</td>

            <td>{{ $ledger['transaction_id'] }}</td>

            <td>{{ "'" . $ledger['client_reference_id'] }}</td>

            <td class="credit">
                @if ($ledger['transaction_type'] == "CREDIT")
                {{ $ledger['amount'] }}
                @else
                -
                @endif
            </td>

            <td class="debit">
                @if ($ledger['transaction_type'] == "DEBIT")
                {{ $ledger['amount'] }}
                @else
                -
                @endif
            </td>

            <td>{{ $ledger['balance'] }}</td>

            <td>{{ $ledger['created_at'] }}</td>
        </tr>
        @endforeach
    </table>

</body>

</html>