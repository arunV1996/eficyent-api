<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Settings;
use Exception;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /**
     * Get application settings.
     *
     * @param Request $request
     * @return JsonResponse
     *
     * @throws Exception
     */
    public function get_app_settings(Request $request)
    {
        try {
            
            $allowed_keys = [
                'site_name',
                'site_icon',
                'site_logo',
                'inactivity_in_seconds'
            ];

            $settings = Settings::whereIn('key', $allowed_keys)->pluck('value', 'key');

            $data['settings'] = $settings;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
