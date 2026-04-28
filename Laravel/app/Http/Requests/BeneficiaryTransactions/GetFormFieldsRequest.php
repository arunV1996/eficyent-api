<?php

namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class GetFormFieldsRequest extends FormRequest
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
        $types = [C2C, C2B, B2C, B2B , USER_TYPE_INDIVIDUAL, USER_TYPE_BUSINESS];

        return [
            'type' => ['nullable', Rule::in($types)],
            'country' => ['required'],
            'currency'     => ['required'],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $root = parent::validated();

        if(!isset($root['type'])) {
            $root['type'] = C2C;
        }

        if($root['type'] == USER_TYPE_INDIVIDUAL) {

            $root['type'] = C2C;
        }elseif($root['type'] == USER_TYPE_BUSINESS) {
            
            $root['type'] = C2B;
        }

        $typeMap = [
            C2C => [
                'beneficiary_type' => USER_TYPE_INDIVIDUAL,
                'remitter_type'    => USER_TYPE_INDIVIDUAL,
            ],
            C2B => [
                'beneficiary_type' => USER_TYPE_INDIVIDUAL,
                'remitter_type'    => USER_TYPE_BUSINESS,
            ],
            B2C => [
                'beneficiary_type' => USER_TYPE_BUSINESS,
                'remitter_type'    => USER_TYPE_INDIVIDUAL,
            ],
            B2B => [
                'beneficiary_type' => USER_TYPE_BUSINESS,
                'remitter_type'    => USER_TYPE_BUSINESS,
            ],
        ];

        $root = array_merge($root, $typeMap[$root['type']]);

        return $root;
    }
}
