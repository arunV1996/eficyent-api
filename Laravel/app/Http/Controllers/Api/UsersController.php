<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Users\UserShowRequest;
use App\Http\Resources\UserResource;
use App\Repositories\UsersRepository;
use Exception;
use Illuminate\Http\Request;

class UsersController extends Controller
{
    protected $repository;

    public function __construct()
    {
        $this->repository = new UsersRepository();
    }

    public function index(Request $request)
    {
        try {

            $user = $request->user();

            $merchant = $user->merchant;

            throw_if(!$merchant, new Exception(api_error(191), 191));

            $users = $this->repository->list($request, $user, $merchant);

            $data['total'] = $users['total'];

            $data['users'] = UserResource::collection($users['users']);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function show(UserShowRequest $request)
    {
        try {

            $user = $request->user();

            $merchant = $user->merchant;

            throw_if(!$merchant, new Exception(api_error(191), 191));

            $validated = $request->validated();

            $user = $this->repository->show($validated, $merchant);

            $data['user'] = new UserResource($user, METHOD_PROFILE);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
