<?php

namespace App\Http\Requests\SubUser;

use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class SubUserShowRequest extends FormRequest
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

            'subuser_id' => [
                'required',
                Rule::exists('users', 'unique_id')->where(function ($query) {

                    $user = $this->user();
                    
                    $query->where('business_user_id', $user->id);
                }),
            ],
        ];
    }
}
