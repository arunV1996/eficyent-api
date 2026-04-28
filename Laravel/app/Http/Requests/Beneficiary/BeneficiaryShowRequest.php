<?php

namespace App\Http\Requests\Beneficiary;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BeneficiaryShowRequest extends FormRequest
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
            'beneficiary_account_id' => ['required', 'string', Rule::exists('beneficiary_accounts', 'unique_id')],
        ];
    }
}
