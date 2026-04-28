<?php

namespace App\Http\Controllers\Api\Callbacks;

use App\Enums\TelegramEvent;
use App\Helpers\TelegramHelper;
use App\Http\Controllers\Controller;
use App\Services\Telegram\TelegramNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class FVBankWebhookController extends Controller
{
    public function __invoke(Request $request)
    {
        $data = $request->all();

        TelegramNotifier::notify(TelegramEvent::CALLBACK_RECEIVED, $data, "FVBank");

        Log::info("Received FV Bank Webhook:", $data);

        return response()->json(['status' => 'success']);
    }
}
