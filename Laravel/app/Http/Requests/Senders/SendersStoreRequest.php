<?php

namespace App\Http\Requests\Senders;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Validators\SenderValidator;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SendersStoreRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

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

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules()
    {

        return SenderValidator::rules($this->all());
    }

    public function validated($key = null, $default = null)
    {
        return SenderValidator::validate(parent::validated());
    }
}
