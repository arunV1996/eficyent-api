<?php

namespace App\Validators;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ImportQuoteValidator
{
    public static function validate(array $data, $user = null): array
    {

        $data = self::normalize($data);

        $rules = self::rules($data, $user);

        $validator = Validator::make($data, $rules);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        return $validator->validated();
    }

    public static function rules(array $data, $user): array
    {
        $rules = [];

        $formFields = FieldsHelper::QuoteFormFields();

        foreach ($formFields as $field) {

            Helper::buildFormRules($field, $rules);
        }

        if (!empty($data['txn_ref_no']) && $user) {
            $rules['txn_ref_no'][] = Rule::unique('beneficiary_transactions', 'txn_ref_no')
                ->where(function ($q) use ($user) {
                    return $q->where('user_id', $user->id);
                });
        }


        return $rules;
    }
    private static function normalize(array $data): array
    {
        if (isset($data['amount'])) {
            $data['amount'] = str_replace(',', '', trim($data['amount']));
        }

        return $data;
    }
}
