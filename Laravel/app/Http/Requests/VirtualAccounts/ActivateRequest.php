<?php

namespace App\Http\Requests\VirtualAccounts;

use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class ActivateRequest extends FormRequest
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
        $available_accounts = available_banks($this->user());

        $available_accounts = array_column($available_accounts, 'key');

        return [
            'type' => ['required', Rule::in($available_accounts)],
        ];
    }
}
