<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BeneficiaryTransaction;
use App\Repositories\DashboardRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DashboardController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new DashboardRepository();
    }
    /**
     * Statistics API
     *
     * @return Response
     * @throws Exception
     *
     */
    public function statistics(Request $request)
    {
        try {

            $user = $request->user();

            $statistics = $this->repository->statistics($request, $user);

            return $this->sendResponse('', '', ['statistics' => $statistics]);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }


    /**
     * Returns data for the charts.
     * 
     * @param Request $request
     * @return JsonResponse
     * @throws Exception
     */
    public function charts_data(Request $request)
    {
        try {
            $user = $request->user();

            $data= $this->repository->charts_data($request, $user);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
