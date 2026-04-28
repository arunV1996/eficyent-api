<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BeneficiaryTransactionUpdateRequest extends FormRequest
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
            
            'beneficiary_transaction_ids' => ['required', 'array'],
            'beneficiary_transaction_ids.*' => ['required', Rule::exists('beneficiary_transactions', 'unique_id')],
            'status' => ['required', Rule::in(array_keys(beneficiary_transaction_approval()))],
            'remarks' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        if (isset($validated['status'])) {

            $map = beneficiary_transaction_approval();

            $validated['status'] = $map[$validated['status']] ?? null;
        }

        return $validated;
    }
}
