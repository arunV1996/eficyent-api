<?php

namespace App\Http\Controllers\Api;

use Exception;
use App\Helpers\Helper;
use App\Models\UserDocument;
use Illuminate\Http\Request;
use App\Helpers\FieldsHelper;
use App\Models\VirtualAccount;
use App\Factories\Kyc\KycFactory;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Crypt;
use Akaunting\Setting\Facade as Setting;
use App\Factories\Onboarding\OnboardingFactory;
use App\Http\Requests\Auth\DeleteAccountRequest;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\PasswordValidationRequest;
use App\Http\Requests\Onboarding\UpdateProfileRequest;
use App\Http\Requests\VirtualAccounts\ActivateRequest;
use App\Factories\VirtualAccounts\VirtualAccountFactory;
use App\Http\Requests\Auth\RegenerateBackupcodesRequest;

class ProfileController extends Controller
{
    /**
     * Get the current user profile.
     *
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function profile(Request $request)
    {

        try {

            $user = $request->user();

            throw_if(!$user, new Exception(api_error(102), 102));

            $data['user'] = new UserResource($user, METHOD_PROFILE);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get the user credentials.
     *
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function get_credentials(Request $request)
    {
        try {

            $user = $request->user();

            throw_if(!$user, new Exception(api_error(102), 102));

            $merchantHeader = $request->header('X-Merchant-Id');

            if($user->merchant && $merchantHeader && $user->merchant->type != MERCHANT_TYPE_WHITELABEL){

                $user = $user->merchant;

                $data['user'] = new UserResource($user, METHOD_GET_CREDENTIALS);

                return $this->sendResponse('', '', $data);
            }
            [$privateKey, $publicKey] = generateRsaKeyPair();

            $user->update([
                'public_key' => Crypt::encryptString($publicKey),
                'private_key' => Crypt::encryptString($privateKey),
            ]);

            $data['user'] = new UserResource($user, METHOD_GET_CREDENTIALS);

            if($user->merchant && $user->merchant->type != MERCHANT_TYPE_WHITELABEL) {
                
                $data['merchant'] = new UserResource($user->merchant, METHOD_GET_CREDENTIALS);
            }

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get user status
     *
     * @param Request $request
     * @return Response
     * @throws Exception
     */
    public function check_user_status(Request $request)
    {
        try {

            $user = $request->user();

            if ($user->user_type == USER_TYPE_INDIVIDUAL && $user->id_verification != IDENTITY_VERIFICATION_COMPLETED) {

                $kyc_service = $user->id_verified_by ?? null;

                if ($kyc_service) {

                    $kyc = KycFactory::resolve($kyc_service);

                    $kyc->status($user);

                    $user->refresh();

                    if ($user->id_verification != IDENTITY_VERIFICATION_COMPLETED) {

                        $kyc_data = $kyc->make($user);

                        $data['id_verification_url'] = $kyc_data;
                    }
                }
            }

            $user->refresh();

            $data['user'] = new UserResource($user, METHOD_USER_STATUS);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Change user password.
     *
     * This endpoint is used to change user password.
     *
     * @param ChangePasswordRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function change_password(ChangePasswordRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            throw_if(!Hash::check($validated['old_password'], $user->password), new Exception(api_error(125), 125));

            throw_if(Hash::check($validated['password'], $user->password), new Exception(api_error(126), 126));

            DB::transaction(function () use ($user, $validated) {

                throw_if(!$user->update(['password' => Hash::make($validated['password'])]), new Exception(api_error(127), 127));
            });

            $user->currentAccessToken()->delete();

            return $this->sendResponse(tr('password_change_success'), '', []);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Deletes the given user account.
     *
     * This endpoint is used to delete a user account.
     *
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function delete_account(DeleteAccountRequest $request)
    {
        try {

            $user = $request->user();

            throw_if(!Hash::check($request->password, $user->password), new Exception(api_error(125), 125));

            DB::transaction(function () use ($user) {

                $user->delete();
            });

            return $this->sendResponse(tr('account_delete_success'), '', []);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Sets up the Google 2FA for the given user.
     *
     * This endpoint is used to set up the Google 2FA for a user.
     *
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function setup_tfa(Request $request)
    {
        try {

            $user = $request->user();

            $google2fa = app('pragmarx.google2fa');

            if (!$user->tfa_secret) {

                $secretKey = $google2fa->generateSecretKey();

                $user->tfa_secret = Crypt::encryptString($secretKey);

                $user->backup_codes = Helper::generateBackupCodes();

                $user->save();
            }

            $secret = Crypt::decryptString($user->tfa_secret);

            $qrCodeUrl = $google2fa->getQRCodeInline(
                Setting::get('site_name'),
                $user->email,
                $secret
            );

            $data['qr_code'] = $qrCodeUrl;

            $data['tfa_secret'] = $secret;

            $data['qr_code_url'] = $google2fa->getQRCodeUrl(Setting::get('site_name'), $user->email, $secret);

            $data['qr_code_png'] = Helper::createQR($data['qr_code_url'], 'qr_codes/' . $user->unique_id . '.png');

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Enables TFA for the given user.
     *
     * This endpoint is used to enable TFA for a user.
     *
     * @param PasswordValidationRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function tfa_status(PasswordValidationRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            throw_if(!Hash::check($validated['password'], $user->password), new Exception(api_error(125), 125));

            throw_if(!Helper::verifyTfaCode($user, $request->verification_code), new Exception(api_error(139), 139));

            if(!$user->is_tfa_setup_completed) {

                $user->is_tfa_setup_completed = ACTIVE;
            }

            $user->is_tfa_enabled = $user->is_tfa_enabled ? INACTIVE : ACTIVE;

            $user->save();

            $data['backup_codes'] = explode(',', $user->backup_codes);

            if(!$user->is_tfa_enabled) {

                $data['backup_codes'] = [];
            }

            return $this->sendResponse(tr('tfa_enable_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Regenerates backup codes for the given user.
     *
     * This endpoint is used to regenerate backup codes for a user.
     *
     * @param RegenerateBackupcodesRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function regenerate_backup_codes(RegenerateBackupcodesRequest $request)
    {
        try {

            $user = $request->user();

            throw_if(!Hash::check($request->password, $user->password), new Exception(api_error(125), 125));

            throw_if(!$user->is_tfa_setup_completed, new Exception(api_error(138), 138));

            $user->backup_codes = Helper::generateBackupCodes();

            $user->save();

            $data['backup_codes'] = explode(',', $user->backup_codes);

            return $this->sendResponse(tr('backup_codes_regenerate_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function update_tour_status(Request $request)
    {
        try {

            $user = $request->user();

            throw_if($user->tour_status == ACTIVE, new Exception(api_error(148), 148));

            $user->tour_status = ACTIVE;

            $user->save();

            return $this->sendResponse(tr('tour_status_update_success'), '', []);

        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Get the update profile form fields.
     *
     * @param  UpdateProfileFormFieldsRequest  $request
     * @return JsonResponse
     */
    public function update_profile_form_fields(ActivateRequest $request)
    {
        try {
            $user = $request->user();

            $formFields = FieldsHelper::updateProfileFormFields($user, $request->type) ?? [];

            return $this->sendResponse('', '', ['form_fields' => $formFields]);

        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Updates the user profile.
     *
     * This endpoint is used to update a user's profile information.
     *
     * @param UpdateProfileRequest $request
     * @return JsonResponse
     * @throws Exception
     */
   public function update_profile(UpdateProfileRequest $request)
   {

    $user = $request->user();

    $validated = $request->validated();

    DB::beginTransaction();

    try {

        foreach ($validated as $documentName => $documentData) {

            if (!is_array($documentData)) continue;

            $data = [];

            if (!empty($documentData['document_file'])) {

                $data['document_file'] =
                    $documentData['document_file'] instanceof \Illuminate\Http\UploadedFile
                        ? Helper::uploadToS3($documentData['document_file'], USER_DOCUMENT_FILE_PATH)
                        : Helper::uploadBase64ToS3($documentData['document_file'], USER_DOCUMENT_FILE_PATH);

                throw_if(!$data['document_file'], new Exception(api_error(109), 109));
            }

            if (!empty($documentData['document_back_file'])) {

                $data['document_back_file'] =
                    $documentData['document_back_file'] instanceof \Illuminate\Http\UploadedFile
                        ? Helper::uploadToS3($documentData['document_back_file'], USER_DOCUMENT_FILE_PATH)
                        : Helper::uploadBase64ToS3($documentData['document_back_file'], USER_DOCUMENT_FILE_PATH);

                throw_if(!$data['document_back_file'], new Exception(api_error(109), 109));
            }

            if (!empty($documentData['document_expiry_date'])) {

                $data['document_expiry_date'] = $documentData['document_expiry_date'];
            }

            UserDocument::updateOrCreate(['user_id' => $user->id, 'document_name' => $documentName], $data);
        }

        if ($user->user_type === USER_TYPE_BUSINESS && !empty($validated['business_verification_type'])) {

            $user->userInformation()->update(['business_verification_type' => $validated['business_verification_type']]);
        }

        DB::commit();

        $response['user'] = new UserResource($user, METHOD_PROFILE);

        return $this->sendResponse(tr('profile_update_success'), '', $response);

        } catch (Exception $e) {

            DB::rollBack();

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
