<?php

namespace App\Http\Requests\Quote;

use App\Helpers\Helper;
use App\Models\VirtualAccount;
use App\Models\Wallet;
use Exception;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class QuoteStoreRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    protected function prepareForValidation()
    {
        if ($this->has('payment_rail')) {

            $this->merge([
                'payment_rail' => strtoupper($this->payment_rail),
            ]);
        }
    }

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
        $networks = Helper::get_payment_rails();

        $network_values = collect($networks)
            ->pluck('value')
            ->map(fn($v) => strtoupper($v))
            ->toArray();

        $rules = [
            'amount'             => ['required', 'numeric', 'min:100'], //TODO
            'recipient_type'     => ['required', Rule::in(array_keys(user_type_map()))],
            'recipient_country'  => ['required'],
            'receiving_currency' => ['required'],
            'bank_account_id'    => ['nullable', Rule::exists('virtual_accounts', 'unique_id'), 'required_without:wallet_id'],
            'quote_type'         => ['required', Rule::in([QUOTE_TYPE_FORWARD, QUOTE_TYPE_REVERSE])],
            'wallet_id'          => ['nullable', Rule::exists('wallets', 'unique_id'), 'required_without:bank_account_id'],
        ];

        if ($this->receiving_currency == 'USD' && $this->recipient_country == 'USA') {

            $rules['payment_rail'] = ['required', Rule::in($network_values)];
        }

        return $rules;
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

        if (isset($validated['payment_rail'])) {
            $validated['payment_rail'] = strtolower($validated['payment_rail']);
        }

        if (isset($validated['recipient_type'])) {

            $map = user_type_map();

            $validated['recipient_type'] = $map[$validated['recipient_type']] ?? null;
        }

        $external_type = getExternalType(
            $validated['recipient_country'],
            $validated['receiving_currency'],
            Helper::getAuthUser()
        );

        $validated['external_type'] = EXTERNAL_TYPE_MASSIVE;

        if (!empty($validated['bank_account_id'])) {

            $virtualAccount = VirtualAccount::where('unique_id', $validated['bank_account_id'])->first();

            $validated['source_type'] = VirtualAccount::class;
            $validated['source_id']   = $virtualAccount->id;
        }

        if (!empty($validated['wallet_id'])) {

            $wallet = Wallet::where('unique_id', $validated['wallet_id'])->first();

            $validated['source_type'] = Wallet::class;
            $validated['source_id']   = $wallet->id;
        }

        if($validated['recipient_country'] != 'USA' && $validated['receiving_currency'] == 'USD') {

            $validated['payment_rail'] = PAYMENT_RAIL_SWIFT;
        }
        unset(
            $validated['bank_account_id'],
            $validated['wallet_id']
        );

        $validated['quote_mode'] = $this->route('mode') ?? QUOTE_MODE_QUOTATION;

        return $validated;
    }
}
