<?php

namespace App\Http\Requests\VirtualAccounts;

use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class GetBalanceRequest extends FormRequest
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
            'unique_id' => ['required', Rule::exists('virtual_accounts', 'unique_id')],
        ];
    }
}
