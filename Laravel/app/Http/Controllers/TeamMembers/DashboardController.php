<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Repositories\DashboardRepository;
use Exception;
use Illuminate\Http\Request;

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
     * Return an array of statistics, given as follows:
     * total_transactions: total number of transactions
     * total_amount: total amount of transactions
     * total_success_amount: total amount of successful transactions
     * total_failed_amount: total amount of failed transactions
     * today_transactions: total number of transactions today
     * today_amount: total amount of transactions today
     * today_success_amount: total amount of successful transactions today
     * today_failed_amount: total amount of failed transactions today
     */
    public function statistics(Request $request)
    {
        try {

            $user = auth('team')->user();

            $statistics = $this->repository->statistics($request, $user->user, $user);
            
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
            $user = auth('team')->user();
            
            $data = $this->repository->charts_data($request, $user->user, $user);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
