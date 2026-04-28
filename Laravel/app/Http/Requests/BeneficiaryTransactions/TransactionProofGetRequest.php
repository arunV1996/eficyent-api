<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Rules\DocumentFileOrBase64;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class TransactionProofGetRequest extends FormRequest
{
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
        $user = $this->user();

        return [
            'beneficiary_transaction_id' => ['required', Rule::exists('beneficiary_transactions', 'unique_id')],
        ];
    }
}
