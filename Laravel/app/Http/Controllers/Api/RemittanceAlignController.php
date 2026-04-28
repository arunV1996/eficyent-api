<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ExecuteRemittanceBatchJob;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\JsonResponse;

class RemittanceAlignController extends Controller
{
    public function stable_coin_remittance_align(): JsonResponse
    {
        ExecuteRemittanceBatchJob::dispatch();

        return $this->sendResponse(api_success(117), 117, []);

    }
}
