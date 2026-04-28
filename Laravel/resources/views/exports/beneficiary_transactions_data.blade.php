<!DOCTYPE html>
<html>

<head>
    <title>{{tr('beneficiary_transactions')}}</title>
</head>
<style type="text/css">
    table {
        font-family: arial, sans-serif;
        border-collapse: collapse;
    }

    .first_row_design {
        background-color: #187d7d;
        color: #ffffff;
    }

    .row_col_design {
        background-color: #cccccc;
    }

    th {
        border: 1px solid #dddddd;
        text-align: left;
        padding: 8px;
        font-weight: bold;

    }

    td {
        border: 1px solid #dddddd;
        text-align: left;
        padding: 8px;

    }
</style>

<body>
    <table>
        <tr>

            <th scope="col" class="text-primary">{{tr('s_no')}}</th>
            <th scope="col">{{tr('transaction_id')}}</th>
            <th scope="col">{{tr('client_ref_no')}}</th>
            <th scope="col">{{tr('sending_amount')}}</th>
            <th scope="col">{{tr('sending_currency')}}</th>
            <th scope="col">{{tr('recipient_amount')}}</th>
            <th scope="col">{{tr('recipient_currency')}}</th>
            <th scope="col">{{tr('fees')}}</th>
            <th scope="col">{{tr('fx_rate')}}</th>
            <th scope="col">{{tr('remitter_name')}}</th>
            <th scope="col">{{tr('beneficiary_name')}}</th>
            <th scope="col">{{tr('account_number')}}</th>
            <th scope="col">{{tr('remarks')}}</th>
            <th scope="col">{{tr('status')}}</th>
            <th scope="col">{{tr('created_at')}}</th>

        </tr>
        @foreach($data as $i => $beneficiary_transaction)

        <tr @if($i % 2==0) class="row_col_design" @endif>

            <td>{{ $i+1 }}</td>

            <td>{{ (string) $beneficiary_transaction['txn_ref_no'] }}</td>

            <td>{{ (string) $beneficiary_transaction['client_ref_no'] }}</td>

            <td>{{ $beneficiary_transaction['sending_amount'] }}</td>

            <td>{{ $beneficiary_transaction['sending_currency'] }}</td>

            <td>{{ $beneficiary_transaction['receiving_amount'] }}</td>

            <td>{{ $beneficiary_transaction['receiving_currency'] }}</td>

            <td>{{ $beneficiary_transaction['commission_amount'] }}</td>

            <td>{{ $beneficiary_transaction['fx_rate'] }}</td>

            <td>{{ $beneficiary_transaction['remitter_name'] }}</td>

            <td>{{ $beneficiary_transaction['beneficiary_name'] }}</td>

            <td>{{ $beneficiary_transaction['account_number'] }}</td>

            <td>{{ $beneficiary_transaction['remarks'] }}</td>

            <td>{{ $beneficiary_transaction['status'] }}</td>

            <td>{{ $beneficiary_transaction['created_at'] }}</td>

            </tr>
            @endforeach
    </table>
</body>

</html>