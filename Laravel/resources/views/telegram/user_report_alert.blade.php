<b>📊 User Transaction Report</b>

<b>User : <code>{{ !empty($body['user']['name']) ? $body['user']['name'] : $body['user']['email'] }}</code></b>
{{info($body)}}
<b>Successful Transactions ✅</b>

@forelse(($body['success'] ?? []) as $success)
<b>From:</b> {{ $success['from_amount'] ?? '--' }} {{ $success['from_currency'] ?? '--' }}
<b>To:</b> {{ $success['to_amount'] ?? '--' }} {{ $success['to_currency'] ?? '--' }}
<b>Count:</b> {{ $success['count'] ?? 0 }}
@empty
<b>Count:</b> {{ $success['count'] ?? 0 }}
@endforelse

<b>Failed Transactions ❌</b>

@forelse(($body['failed'] ?? []) as $failed)
<b>From:</b> {{ $failed['from_amount'] ?? '--' }} {{ $failed['from_currency'] ?? '--' }}
<b>To:</b> {{ $failed['to_amount'] ?? '--' }} {{ $failed['to_currency'] ?? '--' }}
<b>Count:</b> {{ $failed['count'] ?? 0 }}
@empty
<b>Count:</b> {{ $failed['count'] ?? 0 }}
@endforelse
