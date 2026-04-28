<?php
namespace App\Http\Requests\BeneficiaryTransactions;

use App\Http\Requests\Beneficiary\BeneficiaryStoreRequest;
use App\Http\Requests\Senders\SendersStoreRequest;
use App\Models\Quote;
use App\Rules\TfaRule;
use App\Validators\BeneficiaryValidator;
use App\Validators\SenderValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

class ValidateAccountRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'account_number' => ['required','regex:/^\d{9,18}$/'],
            'ifsc' => ['required','regex:/^[A-Z]{4}0[A-Z0-9]{6}$/'],
        ];
    }
}

