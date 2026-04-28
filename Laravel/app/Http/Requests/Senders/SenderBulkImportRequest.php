<?php

namespace App\Http\Requests\Senders;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SenderBulkImportRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    protected function prepareForValidation(): void
    {
        $this->merge([
            'type' => $this->type ?? USER_TYPE_INDIVIDUAL,
        ]);
    }
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
            'file' => [
                'required',
                'file',
                function ($attribute, $value, $fail) {
                    if (strtolower($value->getClientOriginalExtension()) !== 'xlsx') {
                        $fail('Invalid file type. Only XLSX allowed.');
                    }
                },
            ],
            'type' => ['required', Rule::in([USER_TYPE_INDIVIDUAL, USER_TYPE_BUSINESS])],
        ];
    }
}
