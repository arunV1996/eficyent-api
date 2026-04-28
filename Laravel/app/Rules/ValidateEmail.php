<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidateEmail implements ValidationRule
{
    /**
     * Run the validation rule.
     *
     * @param  \Closure(string): \Illuminate\Translation\PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $domain = strtolower(substr(strrchr($value, "@"), 1));

        if (in_array($domain, disposable_email_list(), true)) {
            $fail('Please use a valid email address.');
        }
    }
}
