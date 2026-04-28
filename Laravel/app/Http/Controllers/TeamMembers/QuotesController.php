<?php

namespace App\Http\Controllers\TeamMembers;

use App\Factories\Quotes\QuoteFactory;
use App\Http\Controllers\Controller;
use App\Http\Requests\Quote\QuoteStoreRequest;
use App\Http\Resources\QuoteResource;
use App\Models\Quote;
use App\Models\VirtualAccount;
use App\Repositories\QuoteRepository;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class QuotesController extends Controller
{
    protected $repository;

    public function __construct(QuoteRepository $quoteRepository)
    {
        $this->repository = $quoteRepository;
    }
    public function store(QuoteStoreRequest $request, QuoteFactory $quoteFactory)
    {
        try {

            $user = auth('team')->user()->user;

            $validated = $request->validated();

            $quote = $this->repository->store($validated, $user, $quoteFactory);

            $data['quote'] = new QuoteResource($quote);

            return $this->sendResponse(api_success(107), 107, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
