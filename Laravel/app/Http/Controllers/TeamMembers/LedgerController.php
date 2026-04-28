<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Ledger\LedgerListRequest;
use App\Http\Requests\Ledger\LedgerShowRequest;
use App\Http\Resources\LedgerResource;
use App\Repositories\LedgerRepository;
use Exception;
use Illuminate\Http\Request;

class LedgerController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new LedgerRepository();
    }
    /**
     * Returns a list of ledger records associated with the given user.
     * 
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     *
     */
    public function index(LedgerListRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $ledgers = $this->repository->list($validated, $user, false, auth('team')->user());

            $data['total'] = $ledgers['total'];

            $data['ledgers'] = LedgerResource::collection($ledgers['ledgers']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given ledger.
     *
     * This endpoint is used to show a ledger.
     *
     * @param LedgerShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(LedgerShowRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = auth('team')->user()->user;

            $ledger = $this->repository->show($user, $validated['ledger_id']);

            throw_if(!$ledger, new Exception(api_error(149), 149));

            $data['ledger'] = new LedgerResource($ledger);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function export(LedgerListRequest $request)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $download_type = $request->input('type', FILE_TYPE_PDF);

            $url = $this->repository->export($validated, $user, $download_type);

            $data['url'] = $url;

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
