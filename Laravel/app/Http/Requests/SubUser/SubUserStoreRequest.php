<?php

namespace App\Http\Requests\SubUser;

use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SubUserStoreRequest extends FormRequest
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

        $name_regex = '/^[A-Za-z\s]+$/';

        return [

            'title' => ['required', 'string', Rule::in([Mr, Mrs, Miss])],
            'first_name' => ['required', 'string', 'max:255' , 'regex:' . $name_regex],
            'last_name' => ['nullable', 'string', 'max:255' , 'regex:' . $name_regex],
            'middle_name' => ['nullable', 'string', 'max:255' , 'regex:' . $name_regex],
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
                function ($attribute, $value, $fail) {
                    $domain = strtolower(substr(strrchr($value, "@"), 1));

                    if (in_array($domain, disposable_email_list())) {
                        $fail('Please use a valid email address.');
                    }
                },
            ],
            'mobile_country_code' => ['required', 'digits_between:1,7'],
            'mobile' => ['required', 'digits_between:8,15', 'unique:users,mobile'],
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
}
