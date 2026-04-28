<?php

namespace App\Http\Requests\Team\Auth;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

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
            'email' => ['required', 'email', Rule::exists('team_members', 'email')],
            'password' => ['required'],
            'device_id' => ['required', 'string', 'max:255']
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
        });
    }

    public function validated($key = null, $default = null)
    {
        return array_merge(parent::validated(), [

            'browser_id' => $this->device_id,
        ]);
    }
}
