<?php

namespace App\Helpers;

use Exception;
use Illuminate\Support\Str;
use App\Enums\TelegramEvent;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;

class TelegramHelper
{
    public static function send(string $title, array $payload, ?string $channel = null): void
    {
        try {

            $url = 'https://api.telegram.org/bot' . config('services.telegram.bot_token') . '/sendMessage';

            $formatter = self::formatter($title, $payload);

            $response = Http::post(
                $url,
                [
                    'chat_id'    => $channel ?? config('services.telegram.chat_id'),
                    'text'       => $formatter,
                    'parse_mode' => 'HTML',
                ]
            );

            [$status, $successful, $response] = [$response->status(), $response->successful(), $response->json()];

            $logs[] = [
                'url' => $url,
                'successful' => $successful ? tr('yes') : tr('no'),
                'status' => $status,
                'formatter' => $formatter
            ];

            if($successful) {
                $logs[] = [
                    'message_id' => $response['result']['message_id'] ?? ''
                ];
            }

            info($logs);
            
        } catch (Exception $e) {
            Log::error('Telegram send failed', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Formats the given body into a string, depending on the channel.
     * If no special formatting is defined for the channel, it will be
     * json_encoded.
     *
     * @param string $channel
     * @param array $body
     * @return string
     */
    private static function formatter($channel, $body)
    {
        switch ($channel) {
            case TelegramEvent::DEPOSIT_RECEIVED->value:
                $formatter = view('telegram.deposit_received', ['body' => $body])->render();
                break;
            case TelegramEvent::BENEFICIARY_TRANSACTION_CREATED->value:
                $formatter = view('telegram.transaction_created', ['body' => $body])->render();
                break;
            case TelegramEvent::USER_REPORT_ALERT->value:
                $formatter = view('telegram.user_report_alert', ['body' => $body])->render();
                break;
            case TelegramEvent::PROCESSING_UNIT_INITIATION_FAILED->value:
                $formatter = self::formatPUFailure($body);
                break;

            default:
                $json = json_encode($body, JSON_PRETTY_PRINT);

                $json = htmlspecialchars($json, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

                $formatter = Str::limit($json, 3500, '…');
        }

        return $formatter;
    }

    private static function formatPUFailure(array $data): string
    {
        return
            "<b>Processing Unit Initiation Failed</b>\n\n" .
            "Txn ID: <code>" . ($data['id'] ?? '-') . "</code>\n\n" .
            "Currency: <b>" . ($data['currency'] ?? '-') . "</b>\n\n" .
            "Message: <b>" . ($data['message'] ?? '-') . "</b>\n\n" .
            "Time: <b>" . ($data['created_at'] ?? '-') . "</b>\n";
    }
}