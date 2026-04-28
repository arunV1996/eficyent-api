<?php

namespace App\Http\Requests\Deposit;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Rules\DocumentFileOrBase64;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class DepositCreateRequest extends FormRequest
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
            'type' => ['nullable', Rule::in(array_keys(deposit_type_map()))],
            'source_of_funds' => ['nullable', Rule::in(array_keys(deposit_source_of_fund()))],
            'purpose_of_payment' => ['nullable', Rule::in(array_keys(deposit_purpose()))],
            'proof' => ['nullable', new DocumentFileOrBase64(5)],
            'deposit_currency' => ['nullable', 'string', Rule::in(deposit_currency_types())],
            'from_wallet_address' => ['nullable', 'string'],
            'to_wallet_id' => ['nullable', 'string', Rule::exists('admin_wallets', 'unique_id')],
            'transaction_hash' => ['nullable', 'string'],
        ];

        $user = Helper::getAuthUser();

        if(Helper::is_remitter_deposit_enabled($user)) {
           
            $data['client_reference_id'] = ['required'];
        }
        return $data;
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        $return = array_merge($validated, [
            'virtual_account_id' => $validated['bank_account_id'],
        ]);

        if (isset($validated['type'])) {

            $map = deposit_type_map();

            $return['type'] = $map[$validated['type']] ?? null;
        }

        if(isset($validated['to_wallet_id'])) {

            $return['admin_wallet_id'] = $validated['to_wallet_id'];
        }


        unset($return['bank_account_id'], $return['to_wallet_id']);

        return $return;
    }
}
