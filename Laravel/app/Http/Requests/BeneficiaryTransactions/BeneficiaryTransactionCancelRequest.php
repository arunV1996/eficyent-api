<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BeneficiaryTransactionCancelRequest extends FormRequest
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
            'remarks' => ['nullable', 'string', 'max:255'],
        ];
    }
}
