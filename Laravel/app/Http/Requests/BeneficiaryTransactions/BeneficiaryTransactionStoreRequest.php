<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use App\Models\Quote;
use App\Rules\DocumentFileOrBase64;
use App\Rules\TfaRule;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class BeneficiaryTransactionStoreRequest extends FormRequest
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
        $user = $this->user();

        $quote = null;

        if ($this->quote_id && $user) {

            $quote = Quote::where('unique_id', $this->quote_id)->where('user_id', $user->id)->first();
        }

        $isSupportingDocumentRequired = false;

        if ($user && $user->user_type == USER_TYPE_BUSINESS && $quote) {

            $isSupportingDocumentRequired = $quote->recipient_type === 'BUSINESS' && $quote->recipient_country === 'USA';
        }

        return [
            'beneficiary_account_id' => ['required', Rule::exists('beneficiary_accounts', 'unique_id')],
            'quote_id' => ['required', Rule::exists('quotes', 'unique_id')],
            'remarks' => ['nullable', 'string', 'max:255'],
            'supporting_document' => [Rule::requiredIf($isSupportingDocumentRequired),new DocumentFileOrBase64(5)],
            'remitter_id' => [
                Rule::requiredIf(fn() => $user && $user->enable_sender == 1),
                Rule::exists('senders', 'unique_id'),
            ],
            'verification_code' => requiresTfa() ? ['required', new TfaRule] : ['nullable'],
            'client_reference_id' => ['nullable', 'max:255'],
            'txn_ref_no' => ['nullable', 'max:255'],
            'purpose_of_payment' => ['nullable', 'max:255'],
        ];
    }
}
