<?php

namespace App\Services\Telegram;

use Exception;
use App\Enums\TelegramEvent;
use App\Helpers\TelegramHelper;
use App\Actions\UserAlert\UserAlert;
use App\Http\Resources\BeneficiaryTransactionResource;

class TelegramNotifier
{
    public static function notify(TelegramEvent $event, $payload, $type = null, $message = null): void
    {
        try {

            if (!config('services.telegram.enabled', true)) {
                return;
            }
    
            $normalized = self::normalize($event, $payload, $type, $message);
    
            $channel = $normalized['channel'] ?? null;
    
            unset($normalized['channel']);
    
            TelegramHelper::send($event->value, $normalized, $channel);
            
        } catch(Exception $e) {
            info("TelegramNotifier notify Error: " . $e->getMessage());
        }
    }

    private static function normalize(TelegramEvent $event, $payload, $type, $message): array
    {
        return match ($event) {

            TelegramEvent::BENEFICIARY_TRANSACTION_CREATED => self::beneficiaryTransaction($payload),

            TelegramEvent::DEPOSIT_RECEIVED => self::deposit($payload),

            TelegramEvent::CALLBACK_RECEIVED => self::callback($payload, $type),

            TelegramEvent::USER_REPORT_ALERT => $payload,

            TelegramEvent::PROCESSING_UNIT_INITIATION_FAILED => self::processingUnitInitiationFailed($payload, $message),
        };
    }

    private static function beneficiaryTransaction($txn): array
    {
        $beneficiary_transaction = (new BeneficiaryTransactionResource($txn))->additional(['resource_method' => LIST_RESPONSE]);

        $name = trim(($txn?->user?->first_name ?? '') . ' ' . ($txn?->user?->last_name ?? ''));

        return [
            'id'         => $txn->unique_id,
            'channel'    => $txn->user->merchant ? $txn->user->merchant->telegram_channel : null,
            'user'       => $name ?: ($txn?->user?->email ?? 'N/A'),
            'from_amount'     => $beneficiary_transaction['total_amount'] ?? '--',
            'from_currency'   => $beneficiary_transaction['quote']['source']['currency'] ?? '--',
            'to_amount'     => $beneficiary_transaction['recipient_amount'] ?? '--',
            'to_currency'   => $txn->receiving_currency,
            'fx_rate'       => $beneficiary_transaction['quote']['fx_rate'] ?? '',
            'status' => beneficiary_transaction_status_label($txn->status),
            'created_at' => $txn->created_at->timezone(DEFAULT_TIMEZONE)->format('d-m-Y h:i:s A') . ' IST',
        ];
    }

    private static function deposit($deposit): array
    {
        $name = trim(($deposit?->user?->first_name ?? '') . ' ' . ($deposit?->user?->last_name ?? ''));
        
        return [
            'id'         => $deposit->unique_id,
            'channel'    => $deposit->user->merchant ? $deposit->user->merchant->telegram_channel : null,
            'user'       => $name ?: ($deposit?->user?->email ?? 'N/A'),
            'amount'     => $deposit->total_amount,
            'currency'   => $deposit->virtualAccount->currency,
            'status'     => deposit_transaction_status_label($deposit->status),
            'created_at' => $deposit->created_at->timezone(DEFAULT_TIMEZONE)->format('d-m-Y h:i:s A') . ' IST',
        ];
    }

    private static function processingUnitInitiationFailed($txn, $message): array
    {
        return [
            'id'         => $txn->unique_id,
            'channel'    => "721180083",
            'user'       => $txn->user->name,
            'currency'   => $txn->quote->source->currency,
            'status'     => BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED,
            'message'    => $message ?? '',
            'created_at' => $txn->created_at->timezone(DEFAULT_TIMEZONE)->format('d-m-Y h:i:s A') . ' IST',
        ];
    }

    private static function callback(array $data, $type): array
    {
        return [
            'provider' => $type,
            'payload' => $data,
            'channel' => config('services.telegram.callback_chat_id' ?? null),
        ];
    }
}
