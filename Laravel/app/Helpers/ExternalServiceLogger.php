<?php

namespace App\Helpers;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ExternalServiceLogger {

    /**
     * To create a log file for external API call.
     * @param string $url
     * @param array $payload
     * @param array $response
     * @param int $status_code
     * @param string $module
     * 
     * @return bool
    */
    public static function create($url, $payload, $response, $status_code, $module) {

        $user_id = request()->user()->id ?? 0;

        $content = [
            'module' => $module,
            'url' => $url,
            'payload' => $payload,
            'response' => $response,
            'status_code' => $status_code,
            'created_at_utc' => now(),
            'created_at_ist' => common_date(now(), DEFAULT_TIMEZONE, 'd M Y h:i:s A')
        ];

        $module_to_lower = Str::lower($module);

        if($user_id) {

            $directory_path = "user_external_service_logs/{$user_id}/{$module_to_lower}";

        } else {

            $directory_path = "user_external_service_logs/{$module_to_lower}";
        }

        Storage::disk('public')->makeDirectory($directory_path);

        do {

            $file_name = now()->format('Y-m-d-H-i-s-A') . '-' . generate_unique_id(15) . '.json';

            $file_path = "{$directory_path}/{$file_name}";
    
        } while (Storage::disk('public')->exists($file_path));

        Storage::disk('public')->put($file_path, json_encode($content, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        info(Storage::disk('public')->url($file_path));

        return true;
    }
}