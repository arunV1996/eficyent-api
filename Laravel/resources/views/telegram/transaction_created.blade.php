Transaction From <b>{{$body['user']}}</b>

<b>From Amount :</b> {{$body['from_amount']}} {{$body['from_currency']}}
<b>To Amount :</b> {{$body['to_amount']}} {{$body['to_currency']}}
<b>Exchange Rate :</b> 1 {{$body['from_currency']}} = {{$body['fx_rate']}} {{$body['to_currency']}}
<b>Status :</b> {{$body['status']}}
<b>Date :</b> {{$body['created_at']}}