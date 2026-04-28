<?php

namespace App\Actions\UserAlert;

use Exception;
use Carbon\Carbon;
use App\Models\User;
use App\Enums\TelegramEvent;
use Illuminate\Support\Facades\DB;
use App\Services\Telegram\TelegramNotifier;
use App\Http\Resources\BeneficiaryTransactionResource;
use App\Models\{UserAlertConfiguration, BeneficiaryTransaction};

class UserAlert
{
    public static function execute(array $payload = [])
    {
        $results = self::results($payload);

        foreach ($results as $user) {
            TelegramNotifier::notify(TelegramEvent::USER_REPORT_ALERT, $user);
        }

        return $results;
    }

    private static function results(array $payload = [])
    {
        $results = [];

        try {

            $user_alert_configurations = UserAlertConfiguration::where('status', ACTIVE)->latest()->pluck('user_id')->toArray();

            foreach ($user_alert_configurations as $user_id) {

                $allowed_status = [
                    BENEFICIARY_TRANSACTION_COMPLETED,
                    BENEFICIARY_TRANSACTION_FAILED
                ];

                $user_transactions = BeneficiaryTransaction::query()
                    ->where('user_id', $user_id)
                    ->when(!empty($payload['date']), function ($q) use ($payload) {
                        $start = Carbon::parse($payload['date'], DEFAULT_TIMEZONE)
                            ->startOfDay()
                            ->setTimezone('UTC');

                        $end = Carbon::parse($payload['date'], DEFAULT_TIMEZONE)
                            ->endOfDay()
                            ->setTimezone('UTC');

                        $q->whereBetween('created_at', [$start, $end]);
                    })
                    ->whereIn('status', $allowed_status)
                    ->get();

                $success_transactions = BeneficiaryTransactionResource::collection(collect($user_transactions)->where('status', BENEFICIARY_TRANSACTION_COMPLETED));
                $failed_transactions = BeneficiaryTransactionResource::collection(collect($user_transactions)->where('status', BENEFICIARY_TRANSACTION_FAILED));

                $results[$user_id]['success'] = self::format($success_transactions);
                $results[$user_id]['failed'] = self::format($failed_transactions);

                if(! isset($results[$user_id]['user'])) {

                    $user = User::find($user_id, ['id', DB::raw('CONCAT(first_name, " ", last_name) as name'), 'email', 'merchant_id']);

                    $results[$user_id]['user'] = [
                        'id' => $user->id,
                        'name' => $user->name,
                        'email' => $user->email
                    ];

                    $results[$user_id]['channel'] = $user->merchant ? $user->merchant->telegram_channel : null;
                }
            }
        } catch (Exception $e) {

            info("UserAlert Error : " . $e->getMessage());
        }

        return $results;
    }

    private static function format($transactions)
    {
        $results = [];

        foreach ($transactions as $transaction) {

            $from_currency = $transaction['quote']['source']['currency'] ?? NULL;

            if ($from_currency) {

                $from_amount = $transaction['total_amount'] ?? NULL;

                $to_amount = $transaction['recipient_amount'] ?? NULL;
                $to_currency = $transaction['receiving_currency'] ?? NULL;

                $results[$from_currency] = [
                    'from_currency' => $from_currency,
                    'from_amount' => ($results[$from_currency]['from_amount'] ?? 0) + $from_amount,
                    'to_currency' => $to_currency,
                    'to_amount' => ($results[$from_currency]['to_amount'] ?? 0) + $to_amount,
                    'count' => ($results[$from_currency]['count'] ?? 0) + 1
                ];
            }
        }

        return $results;
    }
}
