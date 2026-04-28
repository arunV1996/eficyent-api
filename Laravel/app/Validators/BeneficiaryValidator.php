<?php

namespace App\Validators;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\ServiceBank;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class BeneficiaryValidator
{
    public static function validate(array $data, $user): array
    {
        if (empty($data['type'])) {

            $data['type'] = (string) USER_TYPE_INDIVIDUAL;
        }

        if(!empty($data['type']) && in_array($data['type'], ["Individual", "Business"])) {

            $data['type'] = $data['type'] === "Individual" ? USER_TYPE_INDIVIDUAL : USER_TYPE_BUSINESS;
        }

        if(!empty($data['type']) && in_array($data['type'], ["PERSONAL", "BUSINESS"])) {

            $data['type'] = $data['type'] === "PERSONAL" ? USER_TYPE_INDIVIDUAL : USER_TYPE_BUSINESS;
        }

        $rules = self::rules($data, $user);

        $validator = Validator::make($data, $rules);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        return self::normalize($validator->validated(), $user);
    }

    public static function rules(array $data, $user): array
    {
        if (empty($data['type']) || empty($data['country']) || empty($data['currency'])) {

            return [
                'type' => ['required', Rule::in([USER_TYPE_BUSINESS, USER_TYPE_INDIVIDUAL])],
                'country' => ['required'],
                'currency' => ['required'],
            ];
        }

        $formattedType = Helper::format_payment_type($user->user_type, $data['type']);

        if($formattedType == C2B) {

            throw ValidationException::withMessages([
                'type' => [api_error(195)],
            ]);
        }

        $supported_countries = Helper::get_receiving_countries($formattedType, $user);

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

        $allowedCurrencies = $currencyMap[$data['country']] ?? [];

        if (!isset($currencyMap[$data['country']])) {
            throw ValidationException::withMessages([
                'country' => ['Country is not supported for this beneficiary type.'],
            ]);
        }

        if (!in_array($data['currency'], $currencyMap[$data['country']], true)) {
            throw ValidationException::withMessages([
                'currency' => ['Currency is not supported for the selected country.'],
            ]);
        }

        $rules = [
            'type' => ['required', Rule::in([USER_TYPE_BUSINESS, USER_TYPE_INDIVIDUAL])],
            'country' => ['required', Rule::in($allowedCountryCodes)],
            'currency' => ['required', Rule::in($allowedCurrencies)],
        ];

        $payload = [
            'type' => $data['type'],
            'country' => $data['country'],
            'currency' => $data['currency'],
        ];

        $fields = FieldsHelper::beneficiary_form_fields($payload, $user);

        foreach ($fields as $field) {

            Helper::buildFormRules($field, $rules);

        }

        return $rules;
    }

    private static function normalize(array $validated, $user): array
    {
        if (isset($validated['receiver_state']) && !empty($validated['receiver_state'])) {

            $validated['receiver_state'] = get_state_code($validated['receiver_state']);
        }

        if (isset($validated['bank_state']) && !empty($validated['bank_state'])) {

            $validated['bank_state'] = get_state_code($validated['bank_state']);
        }

        if (isset($validated['service_bank'])) {

            $service_bank = ServiceBank::where('unique_id', $validated['service_bank'])->first();

            if ($service_bank) {

                $validated['bank_name'] = $service_bank->bank_name;

                $validated['service_bank'] = $service_bank->bank_id;
            }
        }

        $validated['account_name'] = $validated['account_name'] ?? '';

        if (isset($validated['account_name']) && empty($validated['account_name'])) {

            if (!empty($validated['first_name']) && !empty($validated['last_name'])) {

                $validated['account_name'] = trim($validated['first_name'] . ' ' . $validated['last_name']);
            } else {

                $validated['account_name'] = $validated['business_name'] ?? '';
            }
        }

        if (!isset($validated['receiver_country'])) {

            $validated['receiver_country'] = $validated['country'];
        }

        if (!isset($validated['bank_country'])) {

            $validated['bank_country'] = $validated['country'];
        }

        if (!isset($validated['receiver_country'])) {

            $validated['receiver_country'] = $validated['country'];
        }

        if (!isset($validated['bank_country'])) {

            $validated['bank_country'] = $validated['country'];
        }

        if (!isset($validated['address_type'])) {

            $validated['address_type'] = "PRESENT";
        }

        if(!isset($validated['code']) && isset($validated['bank_name'])) {

            $bic_code = ServiceBank::where('bank_name', $validated['bank_name'])->value('iso_code');

            if($bic_code) {

                $validated['code'] = $bic_code;
            }
        }

        $validatedResult = [

            'beneficiaryAccount' => [
                'user_id' => Helper::getAuthUser()->id,
                'first_name' => $validated['first_name'] ?? '',
                'middle_name' => $validated['middle_name'] ?? '',
                'last_name' => $validated['last_name'] ?? '',
                'email' => $validated['email'] ?? '',
                'mobile_country_code' => $validated['mobile_country_code'] ?? '',
                'mobile' => $validated['mobile'] ?? '',
                'account_type' => $validated['account_type'] ?? '',
                'payment_rail' => $validated['payment_rail'] ?? '',
                'service_bank' => $validated['service_bank'] ?? '',
                'bank_name' => $validated['bank_name'] ?? '',
                'routing_number' => $validated['routing_number'] ?? '',
                'account_name' => $validated['account_name'] ?? '',
                'account_number' => $validated['account_number'] ?? '',
                'account_type' => $validated['account_type'] ?? '',
                'swift_code' => $validated['code'] ?? '',
                'iban' => isset($validated['iban']) ? $validated['iban'] : $validated['account_number'] ?? '',
                'intermediary_bank_swift_code' => $validated['intermediary_bank_swift_code'] ?? '',
                'intermediary_bank_name' => $validated['intermediary_bank_name'] ?? '',
                'intermediary_bank_aba' => $validated['intermediary_bank_aba'] ?? '',
                'intermediary_bank_address' => $validated['intermediary_bank_address'] ?? '',
                'intermediary_bank_city' => $validated['intermediary_bank_city'] ?? '',
                'intermediary_bank_state' => $validated['intermediary_bank_state'] ?? '',
                'intermediary_bank_postal_code' => $validated['intermediary_bank_postal_code'] ?? '',
                'intermediary_bank_country' => $validated['intermediary_bank_country'] ?? '',
                'bank_country' => $validated['bank_country'] ?? '',
                'business_name' => $validated['business_name'] ?? '',
                'business_country' => $validated['business_country'] ?? '',
                'type' => $validated['type'] ?? '',
                'country' => $validated['country'] ?? '',
                'currency' => $validated['currency'] ?? '',
            ],

            'beneficiaryAccountAdditionalDetail' => [
                'address_type' => $validated['address_type'] ?? '',
                'address_line1' => $validated['receiver_address_line_1'] ?? '',
                'address_line2' => $validated['receiver_address_line_2'] ?? '',
                'postal_code' => $validated['receiver_postal_code'] ?? '',
                'city' => $validated['receiver_city'] ?? '',
                'state' => $validated['receiver_state'] ?? '',
                'country' => $validated['receiver_country'] ?? '',
                'payment_type' => $validated['payment_type'] ?? '',
                'bank_address_line1' => $validated['bank_address_line_1'] ?? '',
                'bank_address_line2' => $validated['bank_address_line_2'] ?? '',
                'bank_postal_code' => $validated['bank_postal_code'] ?? '',
                'bank_city' => $validated['bank_city'] ?? '',
                'bank_state' => $validated['bank_state'] ?? '',
                'bank_country' => $validated['bank_country'] ?? '',
                'purpose_of_transaction' => $validated['purpose_of_transaction'] ?? '',
                'user_source_of_income' => $validated['source_of_funds'] ?? '',
            ],
        ];

        return $validatedResult;
    }
}
