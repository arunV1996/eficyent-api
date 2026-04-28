<?php

namespace App\Http\Controllers\Api;

use App\Factories\Kyc\KycFactory;
use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Onboarding\GetFormFieldsRequest;
use App\Http\Requests\Onboarding\OnboardingStepThreeRequest;
use App\Http\Requests\Onboarding\OnboardingStepTwoRequest;
use App\Http\Resources\UserResource;
use App\Models\UserDocument;
use App\Models\UserInformation;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Akaunting\Setting\Facade as Setting;

class OnboardingController extends Controller
{
    /**
     * Get the form fields based on the user type and step.
     *
     * @param  GetFormFieldsRequest  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    // public function get_form_fields(GetFormFieldsRequest $request)
    // {
    //     try {

    //         $validated = $request->validated();

    //         $user = $request->user();

    //         $step = $validated['type'];

    //         $data['form_fields'] = FieldsHelper::onboardingFormFields($user, $step) ?? [];

    //         if ($user->onboarding_step > $step && $user->onboarding_step != ONBOARDING_STEP_ONE) {

    //             foreach ($data['form_fields'] as &$field) {

    //                 $field['field_value'] = $user->{$field['field_key']} ?? $user->userInformation->{$field['field_key']} ?? '';
    //             }
    //         }

    //         return $this->sendResponse('', '', $data);

    //     } catch (Exception $e) {

    //         return $this->sendError($e->getMessage(), $e->getCode());
    //     }
    // }

    public function get_form_fields(GetFormFieldsRequest $request)
    {
        try {
 
            $validated = $request->validated();
 
            $user = $request->user();
 
            $step = $validated['type'];
 
            $existingFields = FieldsHelper::onboardingFormFields($user, $step) ?? [];
 
            $newFields = FieldsHelper::onboardingFormFields_new($user, $validated) ?? [];
 
            $existingKeys = collect($existingFields)->pluck('field_key');
 
            $formFields = collect($existingFields)
                ->merge(
                    collect($newFields)->reject(fn($field) => $existingKeys->contains($field['field_key']))
                )
                ->values()
                ->toArray();
 
            if ($user->onboarding_step > $step && $user->onboarding_step != ONBOARDING_STEP_ONE) {
 
                $formFields = collect($formFields)->map(function ($field) use ($user) {
 
                    $field['field_value'] = $user->{$field['field_key']} ?? optional($user->userInformation)->{$field['field_key']} ?? '';
 
                    return $field;
 
                })->toArray();
            }
 
            return $this->sendResponse('', '', [
                
                'form_fields' => $formFields
            ]);
 
        } catch (Exception $e) {
 
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Onboarding step two.
     *
     * This endpoint is used to complete the second step of the onboarding process.
     *
     * @throws  Exception
     * @return  JsonResponse
     */
    public function stepTwo(OnboardingStepTwoRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            throw_if($user->onboarding_step != ONBOARDING_STEP_ONE, new Exception(api_error(108), 108));

            $validated['onboarding_step'] = ONBOARDING_STEP_TWO;

            DB::transaction(function () use ($user, $validated) {

                $user->update($validated);

                UserInformation::updateOrCreate(
                    [
                        'user_id' => $user->id
                    ],
                    $validated
                );

                $user->refresh();
            });

            $data['user'] = new UserResource($user, METHOD_ONBOARDING_STEP_TWO);

            return $this->sendResponse(api_success(106), 106, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Onboarding step three.
     *
     * This endpoint is used to complete the third step of the onboarding process.
     *
     * @throws  Exception
     * @return  JsonResponse
     */
    public function stepThree(OnboardingStepThreeRequest $request, KycFactory $kycFactory)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            throw_if($user->onboarding_step != ONBOARDING_STEP_TWO, new Exception(api_error(108), 108));

            DB::beginTransaction();

            foreach ($validated as $documentName => $documentData) {

                $fileName = null;

                if (isset($documentData['document_file']) && !empty($documentData['document_file'])) {

                    if ($documentData['document_file'] instanceof \Illuminate\Http\UploadedFile) {

                        $fileName = Helper::uploadToS3($documentData['document_file'], USER_DOCUMENT_FILE_PATH);

                        throw_if(!$fileName, new Exception(api_error(109), 109));

                    } else if (is_string($documentData['document_file']) && Helper::isBase64File($documentData['document_file'])) {

                        $fileName = Helper::uploadBase64ToS3($documentData['document_file'], USER_DOCUMENT_FILE_PATH);

                        throw_if(!$fileName, new Exception(api_error(109), 109));
                    }
                }
                 if (isset($documentData['document_back_file']) && !empty($documentData['document_back_file'])) {

                    if ($documentData['document_back_file'] instanceof \Illuminate\Http\UploadedFile) {

                        $documentBackFileName = Helper::uploadToS3($documentData['document_back_file'], USER_DOCUMENT_FILE_PATH);

                        throw_if(!$documentBackFileName, new Exception(api_error(109), 109));

                    } else if (is_string($documentData['document_back_file']) && Helper::isBase64File($documentData['document_back_file'])) {

                        $documentBackFileName = Helper::uploadBase64ToS3($documentData['document_back_file'], USER_DOCUMENT_FILE_PATH);

                        throw_if(!$documentBackFileName, new Exception(api_error(109), 109));
                    }
                }

                UserDocument::updateOrCreate(
                    [
                        'user_id' => $request->user()->id,
                        'document_name' => $documentName
                    ],
                    [
                        'document_type' => $documentData['document_type'] ?? null,
                        'document_country' => $documentData['document_country'] ?? null,
                        'document_file' => $fileName,
                        'document_back_file' => $documentBackFileName ?? null,
                        'document_expiry_date' => $documentData['document_expiry_date'] ?? null,
                        'status' => IDENTITY_VERIFICATION_PENDING
                    ]
                );
            }

            $user->update([
                'onboarding_step' => ONBOARDING_STEP_THREE
            ]);

            if ($user->user_type == USER_TYPE_INDIVIDUAL) {

                $kyc_service = Setting::get('kyc_service') ?? null;

                if ($kyc_service && $kyc_service != ID_VERIFIED_BY_ADMIN) {

                    $kyc = $kycFactory->resolve($kyc_service);

                    $kyc_data = $kyc->make($user);

                    $data['id_verification_url'] = $kyc_data;

                }
            }

            $user->update([
                    'memo' => Helper::generateUniqueUserMemo($user)
                ]);

            DB::commit();

            $user->refresh();

            $data['user'] = new UserResource($user, METHOD_ONBOARDING_STEP_THREE);

            return $this->sendResponse(api_success(106), 106, $data);
        } catch (Exception $e) {

            DB::rollBack();

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
