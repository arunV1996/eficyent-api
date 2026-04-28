<?php

namespace App\Validators;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class TransactionValidator
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

        $formFields = FieldsHelper::transaction_form_fields($user);

        foreach ($formFields as $field) {

            Helper::buildFormRules($field, $rules);
        }

        return $rules;
    }
    private static function normalize(array $data): array
    {
        return $data;
    }
}
