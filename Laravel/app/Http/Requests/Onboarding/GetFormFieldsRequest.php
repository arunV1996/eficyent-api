<?php

namespace App\Http\Requests\Onboarding;

use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class GetFormFieldsRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(array_keys(onboarding_step_map()))],

            'country_of_incorporation' => ['nullable', 'string'],
        ];
    }

    // public function withValidator($validator)
    // {
    //     $validator->after(function ($validator) {

    //         $data = $this->all();

    //         if (!isset($data['type'])) {
    //             return;
    //         }

    //         $map = onboarding_step_map();

    //         $resolvedStep = $map[$data['type']] ?? null;

    //         if ( in_array($resolvedStep, [ ONBOARDING_STEP_TWO_COMPLETED, ONBOARDING_STEP_THREE_COMPLETED ]) ) {

    //             if (empty($data['country_of_incorporation'])) {

    //                 $validator->errors()->add( 'country_of_incorporation', 'The country_of_incorporation field is required.' );
    //             }
    //         }

    //     });
    // }



    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        if (isset($data['type'])) {

            $map = onboarding_step_map();

            $data['type'] = $map[$data['type']] ?? null;
        }

        // if (isset($data['country_of_incorporation'])) {

        //     $data['country_of_incorporation'] = strtoupper($data['country_of_incorporation']);
        // }

        return $data;
    }
}
