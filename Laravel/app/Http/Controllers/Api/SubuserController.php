<?php

namespace App\Http\Controllers\Api;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\SubUser\AcceptInviteRequest;
use App\Http\Requests\SubUser\SubUserShowRequest;
use App\Http\Requests\SubUser\SubUserStoreRequest;
use App\Http\Resources\SubUserResource;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\Email\UserAuthEmailService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Akaunting\Setting\Facade as Setting;
use App\Services\Email\UserEmailService;

class SubuserController extends Controller
{
    /**
     * Returns a list of subusers associated with the given user.
     * 
     * @param  Request  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function index(Request $request)
    {
        try {

            $user = $request->user();

            $base_query = User::where('business_user_id', $user->id)
                ->when($request->filled('search_key'), function ($query) use ($request) {

                    $key = '%' . $request->search_key . '%';

                    $query->where(function ($q) use ($key) {
                        $q->where('email', 'like', $key)
                            ->orWhere('unique_id', 'like', $key)
                            ->orWhere('first_name', 'like', $key)
                            ->orWhere('last_name', 'like', $key)
                            ->orWhere('mobile', 'like', $key);
                    });
                });

            list($skip, $take) = [
                $request->skip ?? 0,
                $request->take ?? TAKE_COUNT
            ];

            $data['total'] = $base_query->count();

            $subusers = $base_query->skip($skip)->take($take)->get();

            $data['subusers'] = SubUserResource::collection($subusers);

            return $this->sendResponse('', '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Stores a new sub user.
     *
     * This endpoint is used to store a new sub user.
     *
     * @param SubUserStoreRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function store(SubUserStoreRequest $request)
    {
        try {

            $validated = $request->validated();

            $user = $request->user();

            $subuser = DB::transaction(function () use ($validated, $user) {

                $subuser = User::create($validated + [
                    'business_user_id' => $user->id,
                    'user_type' => USER_TYPE_INDIVIDUAL,
                    'password' => '',
                    'email_code' => generateEmailCode(),
                    'email_code_expiry' => generateEmailCodeExpiry()
                ]);

                throw_if(!$subuser, new Exception(api_error(500), 500));

                return $subuser->refresh();
            });

            $link_expiry = Setting::get('invite_link_expiry', 60);

            $expiry = time() + $link_expiry * 60;

            $encrypted_token = encrypt([
                'email' => $subuser->email,
                'expires_at' => $expiry,
            ]);

            (new UserEmailService)->user_invite_link($subuser, $encrypted_token);

            $data['subuser'] = new SubUserResource($subuser);

            return $this->sendResponse(tr('subuser_create_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Shows the given sub user.
     *
     * This endpoint is used to show a sub user.
     *
     * @param SubUserShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function show(SubUserShowRequest $request)
    {
        try {

            $user = $request->user();

            $validated  = $request->validated();

            $subuser = User::where('unique_id', $validated['subuser_id'])->where('business_user_id', $user->id)->first();

            throw_if(!$subuser, new Exception(api_error(136), 136));

            $data['subuser'] = new SubUserResource($subuser);

            return $this->sendResponse(tr('subuser_fetch_success'), '', $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Deletes the given sub user.
     * 
     * This endpoint is used to delete a sub user.
     * 
     * @param SubUserShowRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function delete(SubUserShowRequest $request)
    {
        try {

            $user = $request->user();

            $validated = $request->validated();

            $subuser = User::where('unique_id', $validated['subuser_id'])->where('business_user_id', $user->id)->first();

            throw_if(!$subuser, new Exception(api_error(136), 136));

            $subuser->business_user_id = null;

            $subuser->save();

            return $this->sendResponse(tr('account_delete_success'), '', []);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }

    /**
     * Accept an invite sent to a user.
     * 
     * This endpoint is used to accept an invite sent to a user.
     * 
     * @param AcceptInviteRequest $request
     * @return JsonResponse
     * @throws Exception
     */
    public function accept_invite(AcceptInviteRequest $request)
    {
        try {

            $validated = $request->validated();

            $decrypted_data = decrypt($validated['invite_token']);

            throw_if(!$decrypted_data, new Exception(api_error(144), 144));

            throw_if(!$decrypted_data['email'], new Exception(api_error(144), 144));

            throw_if(now()->timestamp > $decrypted_data['expires_at'], new Exception(api_error(145), 145));

            $user = User::where('email', $decrypted_data['email'])->first();

            throw_if(!$user, new Exception(api_error(102), 102));

            throw_if(!$user->email_code, new Exception(api_error(146), 146));

            $user->update([
                'email_code' => null,
                'email_code_expiry' => null,
                'email_verified_at' => now()
            ]);

            $data['user'] = new UserResource($user, METHOD_VERIFY_EMAIL);

            $data['access_token'] = Helper::create_bearer($user);

            UserAuthEmailService::email_verified($user);

            return $this->sendResponse(api_success(102), 102, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
