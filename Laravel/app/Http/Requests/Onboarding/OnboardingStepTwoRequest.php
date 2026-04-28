<?php

namespace App\Http\Requests\Onboarding;

use App\Helpers\FieldsHelper;
use Illuminate\Validation\Rule;
use Illuminate\Foundation\Http\FormRequest;

class OnboardingStepTwoRequest extends ValidateRequest
{
    protected function getStep(): int
    {
        return ONBOARDING_STEP_TWO;
    }
}
