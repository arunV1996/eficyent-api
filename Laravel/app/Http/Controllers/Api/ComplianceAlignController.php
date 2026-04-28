<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\ExecuteComplianceBatchJob;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\JsonResponse;

class ComplianceAlignController extends Controller
{
    public function compliance_align(): JsonResponse
    {
        ExecuteComplianceBatchJob::dispatch();

        return $this->sendResponse(api_success(116), 116, []);

    }
}
