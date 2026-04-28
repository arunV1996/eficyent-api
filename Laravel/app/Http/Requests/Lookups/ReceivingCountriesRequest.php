<?php

namespace App\Http\Requests\Lookups;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class ReceivingCountriesRequest extends FormRequest
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
            'recipient_type' => ['required', Rule::in(array_keys(user_type_map()))],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        if (isset($validated['recipient_type'])) {

            $map = user_type_map();

            $validated['recipient_type'] = $map[$validated['recipient_type']] ?? null;
        }

        return $validated;
    }
}
