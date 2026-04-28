<?php

namespace App\Http\Requests\TeamMembers;

use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class TeamMembersCreateRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('team_members', 'email')],
            'role' => ['required', Rule::in(array_keys(user_role_map()))],
            'permission' => ['required', Rule::in(array_keys(user_permission_map()))],
            'password' => ['required', 'confirmed', 'regex:' . passwordRegex()],
            'mobile_country_code' => ['nullable', 'digits_between:1,7'],
            'mobile' => ['nullable', 'digits_between:8,15', 'unique:users,mobile'],
            'remitter_id' => [
                Rule::requiredIf(fn () => $this->role === 'CORPORATE'),
                Rule::exists('senders', 'id'),
            ],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        $user = Helper::getAuthUser();

        if (isset($validated['role'])) {

            $map = user_role_map();

            $validated['role'] = $map[$validated['role']] ?? null;
        }

        if (isset($validated['permission'])) {

            $map = user_permission_map();

            $validated['permission'] = $map[$validated['permission']] ?? null;
        }

        return array_merge($validated, [
            'user_id' => $user->id
        ]);
    }
}
