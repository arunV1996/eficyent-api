<?php

namespace App\Http\Requests\Auth;

use App\Rules\ValidateEmail;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
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
            'user_type' => ['required', Rule::in(array_keys(user_type_map()))],

            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
                new ValidateEmail(),
            ],
            'password' => ['nullable', 'confirmed', 'regex:' . passwordRegex()],
            'mobile_country_code' => ['required', 'digits_between:1,7'],
            'mobile' => ['required', 'digits_between:8,15', 'unique:users,mobile'],
            'device_type' => ['nullable', Rule::in([DEVICE_TYPE_ANDROID, DEVICE_TYPE_IOS, DEVICE_TYPE_WEB])],
            'country' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages()
    {
        return [
            'email.unique' => 'The email has already been taken.',
            'mobile.unique' => 'The mobile number has already been taken.',
            'mobile.digits_between' => 'The mobile number must be between 8 and 15 digits.',
        ];
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated();

        if (isset($validated['user_type'])) {

            $map = user_type_map();

            $validated['user_type'] = $map[$validated['user_type']] ?? null;
        }

        return $validated;
    }
}
