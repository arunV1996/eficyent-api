<?php

namespace App\Jobs;

use Exception;
use App\Models\User;
use App\Helpers\Helper;
use App\Models\UserService;
use Illuminate\Support\Str;
use Illuminate\Bus\Queueable;
use App\Models\VirtualAccount;
use Illuminate\Support\Facades\Log;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use App\Services\FvBank\VirtualAccountService;

class FetchFvBankVirtualAccountsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 120;

    private int $userId;

    public function __construct(int $userId)
    {
        $this->userId = $userId;
    }

    public function handle(): void
    {
        $user = User::find($this->userId);

        if (!$user) {

            return;
        }

        $beneficiaryId = UserService::where(['user_id' => $user->id, 'service_type' => EXTERNAL_TYPE_FVBANK])->value('external_reference_id');

        throw_if(!$beneficiaryId, new Exception(api_error(178), 178));

        $service = new VirtualAccountService();

        $payload = ['beneficiary_id' => $beneficiaryId];

        $response = $service->getVirtualAccount($payload);

        if (!$response['success']) {

            throw new Exception('FVBank virtual account not ready yet');
        }

        $accounts = $response['data']['VirtualAccounts']['Virtual_Account'] ?? [];

        if (empty($accounts)) {

            throw new Exception('FVBank virtual account list empty');
        }

        foreach ($accounts['Deposit_Instructions'] as $va) {

            Helper::updateFvBankVirtualAccount($user, $va);
        }

        Log::info("FvBank Virtual Account Fetched for User ID: {$user->id}");
    }
}
