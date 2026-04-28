<?php

namespace App\Http\Requests\Deposit;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Rules\DocumentFileOrBase64;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class DepositQuoteRequest extends FormRequest
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
        $data = [
            'bank_account_id' => ['required', 'string', Rule::exists('virtual_accounts', 'unique_id')],
            'amount' => ['required', 'numeric', 'min:1', 'max:10000000'],
            'deposit_currency' => ['nullable', 'string', Rule::in(deposit_currency_types())],
        ];

        return $data;
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        $return = array_merge($validated, [
            'virtual_account_id' => $validated['bank_account_id'],
        ]);

        unset($return['bank_account_id']);

        return $return;
    }
}
