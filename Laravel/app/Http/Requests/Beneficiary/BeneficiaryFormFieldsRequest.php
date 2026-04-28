<?php

namespace App\Http\Requests\Beneficiary;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class BeneficiaryFormFieldsRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    protected function prepareForValidation(): void
    {
        $type = $this->type ?? USER_TYPE_INDIVIDUAL;

        $map = user_type_map();

        $this->merge([
            'type' => $map[$type] ?? $type,
        ]);
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
        $user = Helper::getAuthUser();

        $formatted_type = Helper::format_payment_type($user->user_type, $this->type);

        $supported_countries = Helper::get_receiving_countries($formatted_type, $user);

        $allowedCountryCodes = collect($supported_countries)
            ->pluck('country_code')
            ->unique()
            ->values()
            ->toArray();

        $currencyMap = collect($supported_countries)
            ->mapWithKeys(function ($item) {
                return [
                    $item['country_code'] => $item['currencies'] ?? []
                ];
            })
            ->toArray();

        $allowedCurrencies = $currencyMap[$this->country] ?? [];

        return [
            'type' => [
                'required',
                Rule::in(array_values(user_type_map())),
            ],

            'country' => [
                'required',
                Rule::in($allowedCountryCodes),
            ],

            'currency' => [
                'required',
                Rule::in($allowedCurrencies),
            ],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function ($validator) {

            $user = Helper::getAuthUser();

            $formattedType = Helper::format_payment_type(
                $user->user_type,
                $this->type
            );

            if ($formattedType === C2B) {
                $validator->errors()->add(
                    'type',
                    api_error(195)
                );
            }
        });
    }
}
