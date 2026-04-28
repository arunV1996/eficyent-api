<?php

namespace App\Http\Requests\Lookups;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class DepositLookupRequest extends FormRequest
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
    public function rules()
    {
        return [
            'type' => ['required', Rule::in(LOOKUP_TYPE_SOURCE_OF_FUNDS, LOOKUP_TYPE_PURPOSE_OF_TRANSACTION)],
        ];
    }
}
