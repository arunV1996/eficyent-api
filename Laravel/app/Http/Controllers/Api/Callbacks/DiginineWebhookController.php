<?php

namespace App\Http\Controllers\Api\Callbacks;

use App\Enums\TelegramEvent;
use App\Helpers\TelegramHelper;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessDiginineWebhook;
use App\Models\BeneficiaryTransaction;
use App\Services\Telegram\TelegramNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class DiginineWebhookController extends Controller
{
    public function __invoke(Request $request)
    {
        $data = $request->all();

        Log::info("Received Diginine Webhook:", $data);

        ProcessDiginineWebhook::dispatch($data);

        return response()->json(['received' => true], 200);
    }
}
