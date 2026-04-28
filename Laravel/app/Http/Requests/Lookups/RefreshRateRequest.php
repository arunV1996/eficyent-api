<?php

namespace App\Http\Requests\Lookups;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class RefreshRateRequest extends FormRequest
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
        return [
            'to_currency' => ['required', 'string', 'size:3'],
            'from_currency' => ['required', 'string', 'size:3'],
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            $refresh_all   = $this->input('refresh_all');
            $currency = $this->input('currency');

            if ($refresh_all && $currency) {
                $validator->errors()->add('currency', api_error(188));
            }
        });
    }
}
