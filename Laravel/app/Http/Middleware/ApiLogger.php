<?php

namespace App\Http\Middleware;

use Carbon\Carbon;
use Closure;
use Illuminate\Http\Request;

class ApiLogger
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse)  $next
     * @return \Illuminate\Http\Response|\Illuminate\Http\RedirectResponse
     */
    public function handle(Request $request, Closure $next)
    {
        $startTime = microtime(true);
        
        $requestTime = Carbon::now();

        if ($request->user()) {
            info("Logged In User : " . $request->user()->id . " | " . $request->user()->email . " | " . $request->user()->user_type);
        }

        $to_log = [
            'API URL' => $request->url() . ' (' . $request->method() . ')',
            'Request Time' => $requestTime->timezone(DEFAULT_TIMEZONE)->toDateTimeString(),
        ];

        $payload = $request->all();

        foreach (removeFromLogger() as $removeKey) {
            if (isset($payload[$removeKey])) {
                unset($payload[$removeKey]);
            }

            array_walk_recursive($payload, function (&$item, $key) use ($removeKey) {
                if ($key === $removeKey) {
                    $item = '[REMOVED]';
                }
            });
        }

        array_walk_recursive($payload, function (&$item, $key) {
            if (is_string($item) && preg_match('/^data:\w+\/\w+;base64,/', $item)) {
                $item = '[BASE64 DATA REMOVED]';
            }
        });



        $response = $next($request);

        $endTime = microtime(true);

        $responseTime = Carbon::now();

        $executionTime = round($endTime - $startTime, 4); 

        $to_log['Response Time'] = $responseTime->timezone(DEFAULT_TIMEZONE)->toDateTimeString();

        $to_log['Execution Time'] = $executionTime;

        $to_log['IP Address'] = $request->ip();
        
        info('API Request:', $to_log);

        info('API Payload:', $payload);

        return $response;
    }
}
