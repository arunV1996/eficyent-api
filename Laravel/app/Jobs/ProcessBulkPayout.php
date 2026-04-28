<?php

namespace App\Jobs;

use App\Factories\Quotes\QuoteFactory;
use App\Helpers\Helper;
use App\Models\BeneficiaryAccount;
use App\Models\PayoutJob;
use App\Models\Sender;
use App\Models\TeamMember;
use App\Models\User;
use App\Models\VirtualAccount;
use Illuminate\Bus\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use App\Repositories\BeneficiaryAccountRepository;
use App\Repositories\SenderRepository;
use App\Repositories\BeneficiaryTransactionRepository;
use App\Repositories\QuoteRepository;
use Exception;
use Illuminate\Bus\Batchable;
use Illuminate\Support\Facades\Log;

class ProcessBulkPayout implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, Batchable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public int $payoutJobId) {}

    public function handle(): void
    {
        try {

            $payoutJob = null;

            $payoutJob = PayoutJob::lockForUpdate()->findOrFail($this->payoutJobId);

            if ($payoutJob->status === PAYOUT_JOB_STATUS_COMPLETED) {
                return;
            }

            $payoutJob->update([
                'status' => PAYOUT_JOB_STATUS_PROCESSING,
                'attempts' => $payoutJob->attempts + 1
            ]);

            $user = User::findOrFail($payoutJob->user_id);

            $payload = $payoutJob->payload;

            DB::transaction(function () use ($user, $payload, $payoutJob) {

                $beneficiaryRepo = new BeneficiaryAccountRepository();
                $senderRepo      = new SenderRepository();
                $quoteRepo       = new QuoteRepository();
                $transactionRepo = new BeneficiaryTransactionRepository();

                $beneficiary = BeneficiaryAccount::where('user_id', $user->id)
                    ->where('account_number', $payload['beneficiary']['beneficiaryAccount']['account_number'])
                    ->first()
                    ?? $beneficiaryRepo->create($payload['beneficiary'], $user);

                // if (isset($payload['remitter'])) {
                    $sender = Sender::where('user_id', $user->id)
                        ->where('id_number', $payload['remitter']['id_number'])
                        ->first()
                        ?? $senderRepo->create($payload['remitter'], $user);
                // }
              
                $virtualaccount = VirtualAccount::forUser($user)->firstOrFail();

                $quote = $quoteRepo->store([
                    'amount' => $payoutJob->amount,
                    'recipient_type' => USER_TYPE_INDIVIDUAL,
                    'recipient_country' => $beneficiary->country,
                    'receiving_currency' => $beneficiary->currency,
                    'quote_type' => QUOTE_TYPE_REVERSE,
                    'external_type' => getExternalType($beneficiary->country, $beneficiary->currency, $user),
                    'source_type' => VirtualAccount::class,
                    'source_id' => $virtualaccount->id,
                    'quote_mode' => QUOTE_MODE_QUOTATION,
                ], $user, new QuoteFactory());

                $transactionPayload = [
                    'beneficiary_account_id' => $beneficiary->unique_id,
                    'quote_id' => $quote->unique_id,
                    'remarks' => $payload['remarks'],
                    'txn_ref_no' => $payload['txn_ref_no'] ?? null
                ];

                // if (isset($payload['remitter'])) {
                    
                    $transactionPayload['remitter_id'] = $sender->unique_id;
                // }

                $creator = null;

                if(isset($payload['creator'])) {
                    
                    $creator = TeamMember::where('id', $payload['creator'])->first();
                }

                $transaction = $transactionRepo->create($transactionPayload, $user, $creator ?? null);

                $payoutJob->update([
                    'beneficiary_transaction_id' => $transaction->id,
                ]);
            });


            $this->updatePayoutJob($payoutJob, PAYOUT_JOB_STATUS_COMPLETED);
        } catch (Exception $e) {

            if ($payoutJob) {

                $this->updatePayoutJob($payoutJob, PAYOUT_JOB_STATUS_FAILED, $e->getMessage());

                Log::error("Payout job failed", [
                    'payout_job_id' => $payoutJob->id,
                    'row'           => $payoutJob->row_number,
                    'user_id'       => $payoutJob->user_id,
                    'reason'        => $e->getMessage(),
                ]);
            }
            throw $e;
        }
    }

    private function updatePayoutJob($payoutJob, $status, $error_message = null)
    {
        $payoutJob->update([
            'status'        => $status,
            'error_message' => $error_message,
        ]);
    }
}
