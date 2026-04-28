<?php

namespace App\Http\Requests\Onboarding;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProfileRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    public function authorize(): bool
    {
        return true;
    }

    private function base64FileRule(): array
    {
        return [
            'nullable',
            'string',
            'regex:/^data:(image\/(jpeg|jpg|png)|application\/pdf);base64,/',
        ];
    }

    public function rules(): array
    {
        $user = $this->user();

        $formFields = FieldsHelper::updateProfileFormFields($user, EXTERNAL_TYPE_FVBANK) ?? [];

        $rules = [];

        foreach ($formFields as $field) {

            Helper::buildFormRules($field, $rules);
        }

        return $rules;

        // $businessTypes = Helper::get_lookups(LOOKUP_BUSINESS_VERIFICATION_TYPES) ?? [];

        // $allowedBusinessTypes = array_column($businessTypes, 'value');

        // $fileRule = $this->base64FileRule();

        // $rules = [

        //     'proof_of_address' => ['nullable', 'array'],
        //     'proof_of_address.document_file'        => $fileRule,
        //     'proof_of_address.document_back_file'   => $fileRule,
        //     'proof_of_address.document_expiry_date' => ['nullable', 'date'],

        //     'source_of_funds' => ['nullable', 'array'],
        //     'source_of_funds.document_file'        => $fileRule,
        //     'source_of_funds.document_back_file'   => $fileRule,
        //     'source_of_funds.document_expiry_date' => ['nullable', 'date'],
        // ];

        // if ($user->user_type === USER_TYPE_INDIVIDUAL) {
        //     $rules += [
        //         'id_document' => ['nullable', 'array'],
        //         'id_document.document_file'        => $fileRule,
        //         'id_document.document_back_file'   => $fileRule,
        //         'id_document.document_expiry_date' => ['nullable', 'date'],
        //     ];
        // }

        // if ($user->user_type === USER_TYPE_BUSINESS) {
        //     $rules += [
        //         'proof_of_ownership' => ['nullable', 'array'],
        //         'proof_of_ownership.document_back_file'   => $fileRule,
        //         'proof_of_ownership.document_expiry_date' => ['nullable', 'date'],
        //         'business_verification_type' => [
        //             'nullable',
        //             'string',
        //             Rule::in($allowedBusinessTypes),
        //         ],
        //     ];
        // }

        // return $rules;
    }
}
