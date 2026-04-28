<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BeneficiaryTransactionShowRequest extends FormRequest
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
            'beneficiary_transaction_id' => [
                'required_without_all:txn_ref_no,client_reference_id',
                Rule::exists('beneficiary_transactions', 'unique_id')
            ],
            'txn_ref_no' => [
                'required_without_all:beneficiary_transaction_id,client_reference_id',
                Rule::exists('beneficiary_transactions', 'txn_ref_no')
            ],
            'client_reference_id' => [
                'required_without_all:beneficiary_transaction_id,txn_ref_no',
                Rule::exists('beneficiary_transactions', 'client_reference_id')
            ],
        ];
    }
}
