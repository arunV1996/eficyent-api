<?php
namespace App\Http\Requests\BeneficiaryTransactions;

use App\Http\Requests\Beneficiary\BeneficiaryStoreRequest;
use App\Http\Requests\Senders\SendersStoreRequest;
use App\Models\Quote;
use App\Validators\BeneficiaryValidator;
use App\Validators\ImportQuoteValidator;
use App\Validators\SenderValidator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

class InstantPayoutStoreRequest extends FormRequest
{
    protected $stopOnFirstFailure = false;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'transaction'          => ['required', 'array'],
            'remitter'             => ['required', 'array'],
            'beneficiary'          => ['required', 'array'],
        ];
    }

    public function validated($key = null, $default = null)
    {
        $root = parent::validated();

        $user = $this->user();

        try {

            $validateTransaction = ImportQuoteValidator::validate( $root['transaction']);
        
            $validatedBeneficiary = BeneficiaryValidator::validate( $root['beneficiary'],$user);

            $validatedSender = SenderValidator::validate($root['remitter']);
        } catch (ValidationException $e) {

            throw $e;
        }

        return [
            'quote' => $validateTransaction,
            'remitter'      => $validatedSender,
            'beneficiary' => $validatedBeneficiary,
        ];
    }
}

