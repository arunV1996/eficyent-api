<?php

namespace App\Http\Requests\Auth;

use App\Helpers\Helper;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

class LoginRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    protected $allowedKeys = [];

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
            'email' => ['required', 'email'],
            'password' => ['required'],
            'device_id' => ['required', 'string', 'max:255'],
            'device_type' => ['nullable', Rule::in([DEVICE_TYPE_ANDROID, DEVICE_TYPE_IOS, DEVICE_TYPE_WEB])],
        ];
    }

    protected function prepareForValidation()
    {
        $this->allowedKeys = array_keys($this->rules());
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {

            Helper::blockExtraFields($this, $validator, $this->allowedKeys);

            if (!Auth::attempt($this->only('email', 'password'))) {
                $validator->errors()->add('email', 'Invalid Username or Password');
            }
        });
    }

    public function validated($key = null, $default = null)
    {
        return array_merge(parent::validated(), [

            'browser_id' => $this->device_id,
        ]);
    }
}
