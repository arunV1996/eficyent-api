<?php

namespace App\Http\Requests\Onboarding;

use App\Helpers\FieldsHelper;
use App\Helpers\Helper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

abstract class ValidateRequest extends FormRequest
{
    protected $stopOnFirstFailure = false;

    abstract protected function getStep(): int;
    public function authorize(): bool
    {
        return true;
    }
    public function rules(): array
    {
        $user = $this->user();

        $formFields = FieldsHelper::onboardingFormFields($user, $this->getStep());

        $rules = [];

        foreach ($formFields as $field) {

            Helper::buildFormRules($field, $rules);
        }

        return $rules;
    }

    public function validated($key = null, $default = null)
    {
        $validated = parent::validated($key, $default);

        if(isset($validated['state']) && !empty($validated['state'])) {
            
            $validated['state'] = get_state_code($validated['state']);
        }

        $user = $this->user();

        if ($user->user_type == USER_TYPE_BUSINESS && $this->getStep() == ONBOARDING_STEP_TWO) {

            if (isset($validated['owners'])) {

                foreach ($validated['owners'] as $key => $owner) {
                    
                    if(isset($owner['state']) && !empty($owner['state'])) {

                        $validated['owners'][$key]['state'] = get_state_code($owner['state']);
                    }
                }

                $validated['business_persons'] = $validated['owners'];

                unset($validated['owners']);
            }
        }

        return $validated;
    }
}
