<?php

namespace App\Http\Requests\Senders;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use App\Models\Sender;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SendersUpdateRequest extends FormRequest
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

        $rules = [
            'remitter_id' => [
                'required',
                Rule::exists('senders', 'unique_id'),
            ],
        ];

        if(!$this->has('remitter_id')) {

            return $rules;
        }

        $type = Sender::where('unique_id', $this->input('remitter_id'))->value('type');

        $form_fields = FieldsHelper::sender_fields($type);

        foreach ($form_fields as $field) {

            Helper::buildFormRules($field, $rules);
        }
        
        return $rules;
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        $validatedResult = $validated;

        if($this->type == USER_TYPE_BUSINESS){

            $validatedResult = array_merge($validated, [
                'first_name' => $validated['business_name'],
            ]);

            unset($validatedResult['business_name']);
        }

        return $validatedResult;
    }
}
