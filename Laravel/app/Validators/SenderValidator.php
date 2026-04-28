<?php

namespace App\Validators;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\Sender;
use Exception;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SenderValidator
{
    public static function validate(array $data): array
    {

        if (empty($data['type'])) {

            $data['type'] = (string) USER_TYPE_INDIVIDUAL;
        }

        if (!empty($data['type']) && in_array($data['type'], ["Individual", "Business"])) {

            $data['type'] = $data['type'] === "Individual" ? USER_TYPE_INDIVIDUAL : USER_TYPE_BUSINESS;
        }

        if(!empty($data['type']) && in_array($data['type'], ["PERSONAL", "BUSINESS"])) {

            $data['type'] = $data['type'] === "PERSONAL" ? USER_TYPE_INDIVIDUAL : USER_TYPE_BUSINESS;
        }


        $rules = self::rules($data);

        $validator = Validator::make($data, $rules);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        return self::normalize($validator->validated());
    }

    public static function rules(array $data): array
    {
        $rules = [
            'type' => ['required', Rule::in([USER_TYPE_BUSINESS, USER_TYPE_INDIVIDUAL])],
        ];

        $type = $data['type'] ?? null;

        if (!$type) {
            return $rules;
        }

        $formFields = FieldsHelper::sender_fields($type);

        foreach ($formFields as $field) {
            Helper::buildFormRules($field, $rules);
        }

        return $rules;
    }

    private static function normalize(array $validated): array
    {
        if (isset($validated['state']) && !empty($validated['state'])) {

            $validated['state'] = get_state_code($validated['state']);
        }
        $validatedResult = $validated;

        if ($validated['type'] == USER_TYPE_BUSINESS) {

            $validatedResult = array_merge($validated, [
                'first_name' => $validated['business_name'],
            ]);

            unset($validatedResult['business_name']);

            if (isset($validated['owners'])) {

                foreach ($validated['owners'] as $key => $owner) {

                    if (isset($owner['state']) && !empty($owner['state'])) {

                        $validated['owners'][$key]['state'] = get_state_code($owner['state']);
                    }
                }
                $validatedResult['business_persons'] = $validated['owners'];

                unset($validatedResult['owners']);
            }
        }

        return $validatedResult;
    }
}
