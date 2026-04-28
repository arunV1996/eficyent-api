<?php

namespace App\Http\Requests\Senders;

use App\Helpers\Helper;
use App\Models\Sender;
use Exception;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SendersFormFieldsRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    protected function prepareForValidation(): void
    {
        if (!$this->filled('type') && !$this->filled('remitter_id')) {
            $this->merge([
                'type' => user_type_label(USER_TYPE_INDIVIDUAL),
            ]);
        }
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
            'type' => ['required_without:remitter_id', Rule::in(array_keys(user_type_map()))],

            'remitter_id' => ['required_without:type', 'nullable', 'exists:senders,unique_id'],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated();

        if (isset($validated['type'])) {

            $map = user_type_map();

            $validated['type'] = $map[$validated['type']] ?? null;
        }

        if(isset($validated['remitter_id']) && !empty($validated['remitter_id'])) {

            $sender = Sender::where('unique_id', $validated['remitter_id'])->first();

            throw_if(!$sender, new Exception(api_error(132), 132));

            $validated['type'] = $sender->type;
        }

        return $validated;
    }
}
