<?php

namespace App\Http\Requests\Senders;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SendersShowRequest extends FormRequest
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
            'remitter_id' => ['required_without:id_number', 'string', Rule::exists('senders', 'unique_id')],
            'id_number' => ['required_without:remitter_id', 'string', Rule::exists('senders', 'id_number')],
        ];
    }

    public function withValidator($validator)
    {
        $validator->after(function ($validator) {
            $id_number   = $this->input('id_number');
            $remitter_id = $this->input('remitter_id');

            if ($remitter_id && $id_number) {
                $validator->errors()->add('remitter_id', api_error(186));
            }
        });
    }
}
