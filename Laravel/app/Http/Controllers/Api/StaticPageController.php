<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StaticPages\StaticPageGetRequest;
use App\Http\Resources\StaticPageResource;
use App\Models\StaticPage;
use Exception;
use Illuminate\Http\Request;

class StaticPageController extends Controller
{
    //

    public function index(Request $request){

        try{

            $static_pages = StaticPage::where('status', 1)->get();

            $data['total'] = $static_pages->count();

            $data['static_pages'] = StaticPageResource::collection($static_pages);

            return $this->sendResponse('', '', $data);

        }catch(Exception $e){

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show(Request $request){

        try{

            $base_query = StaticPage::where('status', 1)
                        ->when($request->filled('type'), function ($query) use ($request) {
                            $query->where('type', $request->type);
                        })
                        ->when($request->filled('static_page_unique_id'), function ($query) use ($request) {
                            $query->where('unique_id', $request->static_page_unique_id);
                        });

            $static_page = $base_query->first();

            throw_if(!$static_page, new Exception(api_error(164), 164));

            $data['static_page'] = new StaticPageResource($static_page);

            return $this->sendResponse('', '', $data);

        }catch(Exception $e){

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
