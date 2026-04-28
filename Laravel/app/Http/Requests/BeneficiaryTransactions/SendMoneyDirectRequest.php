<?php
namespace App\Http\Requests\BeneficiaryTransactions;

use App\Helpers\Helper;
use App\Http\Requests\Beneficiary\BeneficiaryStoreRequest;
use App\Http\Requests\Senders\SendersStoreRequest;
use App\Models\Quote;
use App\Rules\TfaRule;
use App\Validators\BeneficiaryValidator;
use App\Validators\SenderValidator;
use App\Validators\TransactionValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

class SendMoneyDirectRequest extends FormRequest
{
    protected $stopOnFirstFailure = true;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transaction'            => ['required', 'array'],
            'remitter'               => ['required', 'array'],
            'beneficiary'            => ['required', 'array'],
            'verification_code'      => requiresTfa() ? ['required', new TfaRule] : ['nullable'],
        ];
    }

    public function validated($key = null, $default = null, $user = null)
    {
        
        $root = parent::validated();

        $user = Helper::getAuthUser();

        try {
        
            $validatedBeneficiary = BeneficiaryValidator::validate( $root['beneficiary'],$user);

            $validatedSender = SenderValidator::validate($root['remitter']);

            $validatedTransaction = TransactionValidator::validate($root['transaction'],$user);

        } catch (ValidationException $e) {
            throw $e;
        }

        return [
            'transaction' => $validatedTransaction,
            'sender'      => $validatedSender,
            'beneficiary' => $validatedBeneficiary,
        ];
    }
}

