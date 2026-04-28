<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Resources\TeamMemberResource;
use App\Models\Settings;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ProfileController extends Controller
{
    /**
     * Get the current user profile.
     *
     * @return JsonResponse
     * @throws Exception
     */
    public function profile()
    {
        try {

            $user = auth('team')->user();

            $data['user'] = new TeamMemberResource($user);

            return $this->sendResponse("", "", $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get the current user credentials.
     *
     * This endpoint is used to get the current user credentials.
     * 
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function get_credentials(Request $request)
    {
        try {

            $user = auth('team')->user();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if($user->status == TEAM_MEMBER_INACTIVE, new Exception(api_error(160), 160));

            [$privateKey, $publicKey] = generateRsaKeyPair();

            $user->update([
                'public_key' => Crypt::encryptString($publicKey),
                'private_key' => Crypt::encryptString($privateKey),
            ]);

            $data['user'] = [
                'unique_id' => $user->unique_id,
                'api_key' => $user->api_key,
                'salt_key'  => Crypt::decryptString($user->salt_key),
                'private_key'  => Crypt::decryptString($user->private_key),
            ];

            return $this->sendResponse("", "", $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get application settings.
     *
     * This endpoint is used to get the application settings.
     * 
     * @param Request $request
     * @return JsonResponse
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

    public function change_password(ChangePasswordRequest $request)
    {
        try {

            $user = auth('team')->user();

            $validated = $request->validated();

            throw_if(!Hash::check($validated['old_password'], $user->password), new Exception(api_error(125), 125));

            throw_if(Hash::check($validated['password'], $user->password), new Exception(api_error(126), 126));

            DB::transaction(function () use ($user, $validated) {

                $userUpdate = $user->update([
                    'last_password_reset' => now(),
                    'password' => Hash::make($validated['password'])
                ]);

                throw_if(!$userUpdate, new Exception(api_error(127), 127));

            });

            $user->currentAccessToken()->delete();

            return $this->sendResponse(tr('password_change_success'), '', []);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
