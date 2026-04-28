<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use App\Rules\TfaRule;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BulkPayoutStoreRequest extends FormRequest
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

        $types = [USER_TYPE_INDIVIDUAL, USER_TYPE_BUSINESS];

        return [
            'file' => [
                'required',
                'file',
                function ($attribute, $value, $fail) {
                    if (strtolower($value->getClientOriginalExtension()) !== 'xlsx') {
                        $fail('Invalid file type. Only XLSX allowed.');
                    }
                },
            ],
            'type' => ['nullable', Rule::in($types)],
            'country' => ['required'],
            'currency'     => ['required'],
            'verification_code' => requiresTfa() ? ['required', new TfaRule] : ['nullable'],
        ];
    }
    
    public function validated($key = null, $default = null)
    {
        $root = parent::validated();

        if (!isset($root['type'])) {
            $root['type'] = USER_TYPE_INDIVIDUAL;
        }

        return $root;
    }
}
