<?php

namespace App\Http\Requests\Ledger;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class LedgerListRequest extends FormRequest
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
            'from_date' => ['nullable', 'date'],
            'to_date' => ['nullable', 'date'],
            'transaction_type' => ['nullable', Rule::in(array_keys(transaction_type_map()))],
            'search_key' => ['nullable', 'string'],
            'bank_account_id'    => ['nullable', Rule::exists('virtual_accounts', 'unique_id'), 'required_without:wallet_id'],
            'wallet_id'          => ['nullable', Rule::exists('wallets', 'unique_id'), 'required_without:bank_account_id'],
            'skip' => ['nullable'],
            'take' => ['nullable'],
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            $bank   = $this->input('bank_account_id');
            $wallet = $this->input('wallet_id');

            if ($bank && $wallet) {
                $validator->errors()->add(
                    'wallet_id',
                    api_error(166)
                );
            }
        });
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        if (isset($validated['transaction_type'])) {

            $map = transaction_type_map();

            $validated['transaction_type'] = $map[$validated['transaction_type']] ?? null;
        }

        return $validated;
    }
}
