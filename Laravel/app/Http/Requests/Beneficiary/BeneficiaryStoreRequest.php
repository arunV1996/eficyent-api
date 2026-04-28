<?php

namespace App\Http\Requests\Beneficiary;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\ServiceBank;
use App\Validators\BeneficiaryValidator;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;
use PHPUnit\TextUI\Help;

class BeneficiaryStoreRequest extends FormRequest
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
    public function prepareForValidation()
    {
        if ($this->has('type')) {

            $userType = strtoupper(trim($this->input('type')));

            $mapped = match ($userType) {
                'PERSONAL' => USER_TYPE_INDIVIDUAL,
                'BUSINESS' => USER_TYPE_BUSINESS,
                default => null,
            };

            if ($mapped !== null) {
                $this->merge([
                    'type' => $mapped,
                ]);
            }
        }
    }

    public function rules(): array
    {

        return BeneficiaryValidator::rules(
            $this->all(),
            Helper::getAuthUser()
        );
    }

    public function validated($key = null, $default = null)
    {

        return BeneficiaryValidator::validate(
            parent::validated(),
            Helper::getAuthUser()
        );
    }
}
