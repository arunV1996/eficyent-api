<?php

namespace App\Http\Controllers\TeamMembers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Team\Auth\LoginRequest;
use App\Http\Resources\TeamMemberResource;
use App\Models\TeamMember;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;

class LoginController extends Controller
{
    /**
     * Login with email and password.
     * 
     * @param  LoginRequest $request
     *
     * @return  JsonResponse
     *
     * @throws  Exception
     */
    public function login(LoginRequest $request)
    {

        try {

            $validated = $request->validated();

            $user = TeamMember::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if(!Hash::check($validated['password'], $user->password), new Exception(api_error(125), 125));

            throw_if($user->status == TEAM_MEMBER_INACTIVE, new Exception(api_error(160), 160));

            throw_if($user->role == TEAM_MEMBER_ROLE_CORPORATE, new Exception(api_error(185), 185));

            $data['user'] = new TeamMemberResource($user);

            $data['password_reset'] = false;

            if (!$user->last_password_reset) {

                $data['password_reset'] = true;

                return $this->sendResponse(api_success(104), 104, $data);
            }

            $user->tokens()->delete();

            $token = $user->createToken('team_member_token', [AUTHENTICATION_ABILITY])->plainTextToken;

            $data['access_token'] = $token;

            return $this->sendResponse(api_success(104), 104, $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Logout user.
     *
     * This endpoint is used to logout user.
     * 
     * @return  JsonResponse
     *
     * @throws  Exception
     */
    public function logout(Request $request)
    {
        try {

            $user = auth('team')->user();

            throw_if(!$user, new Exception(api_error(102), 102));

            $user->tokens()->delete();

            return $this->sendResponse(api_success(105), 105, []);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    public function corporate_login(LoginRequest $request)
    {

        try {

            $validated = $request->validated();

            $user = TeamMember::where('email', $validated['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if(!Hash::check($validated['password'], $user->password), new Exception(api_error(125), 125));

            throw_if($user->status == TEAM_MEMBER_INACTIVE, new Exception(api_error(160), 160));

            throw_if($user->role != TEAM_MEMBER_ROLE_CORPORATE, new Exception(api_error(185), 185));

            $data['user'] = new TeamMemberResource($user);

            $data['password_reset'] = false;

            if (!$user->last_password_reset) {

                $data['password_reset'] = true;

                return $this->sendResponse(api_success(104), 104, $data);
            }

            $user->tokens()->delete();

            $token = $user->createToken('team_member_token', [AUTHENTICATION_ABILITY])->plainTextToken;

            $data['access_token'] = $token;

            return $this->sendResponse(api_success(104), 104, $data);
        } catch (Exception $e) {
            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
