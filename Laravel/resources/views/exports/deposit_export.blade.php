<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>{{ tr('deposits') }}</title>

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
            <td>{{ tr('memo') }}</td>
            <th>{{ tr('amount') }}</th>
            <th>{{ tr('status') }}</th>
            <th>{{ tr('date') }}</th>
        </tr>

        @foreach ($deposit_details as $i => $deposit)
        <tr>
            <td>{{ $i + 1 }}</td>

            <td>{{ $deposit['unique_id'] }}</td>

            <td>{{ $deposit['memo'] }}</td>

            <td>{{ $deposit['amount'] }} {{ $deposit['currency'] }}</td>

            <td>{{ deposit_transaction_status_formatted($deposit['status']) }}</td>

            <td>{{ $deposit['created_at'] }}</td>
        </tr>
        @endforeach
    </table>

</body>

</html>