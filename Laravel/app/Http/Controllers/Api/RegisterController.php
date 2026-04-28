<?php

namespace App\Http\Controllers\Api;

use App\Helpers\Helper;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\VerifyOtpRequest;
use App\Http\Resources\UserResource;
use App\Models\Merchant;
use App\Models\User;
use App\Models\UserInformation;
use App\Services\Email\UserAuthEmailService;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class RegisterController extends Controller
{

    /**
     * Register a user.
     *
     * This endpoint is used to register a user.
     *
     * @param  RegisterRequest  $request
     * @return  JsonResponse
     * @throws  Exception
     */
    public function register(RegisterRequest $request)
    {
        try {

            $validated = $request->validated();

            if(isset($validated['password']) && !empty($validated['password'])){

                $validated['password'] = Hash::make($validated['password']);
            }

            $merchantHeader = $request->header('X-Merchant-Id');

            $user = DB::transaction(function () use ($validated, $merchantHeader) {

                $sendEmail = false;

                if(!$merchantHeader){

                    $sendEmail = true;
                }

                if($merchantHeader){

                    $merchant = Merchant::where('unique_id', $merchantHeader)->first();

                    if($merchant){

                        if($merchant->type == MERCHANT_TYPE_WHITELABEL){
                            $sendEmail = true;
                        }

                        if($merchant->type == MERCHANT_TYPE_PAYINCOLLECTION || $merchant->type == MERCHANT_TYPE_PAYOUTINTEGRATOR){
                            
                            $isSupported = Helper::isSupportedUserType($validated['user_type'], $merchant);

                            throw_if(!$isSupported, Exception::class, api_error(194), 194);
                        }
                    }
                }

                $user = User::Create($validated);

                if($sendEmail){

                    UserAuthEmailService::registerd($user);
                }else{

                    $user->update([
                        'email_code' => null,
                        'email_code_expiry' => null,
                        'email_verified_at' => now()
                    ]);
                }

                $user->refresh();

                if(isset($validated['country'])){

                    UserInformation::updateOrCreate(
                        [
                            'user_id' => $user->id
                        ],
                        [
                            'country' => $validated['country']
                        ]
                    );
                }

                return $user;
            });

            $data['user'] = new UserResource($user, METHOD_REGISTER);

            return $this->sendResponse(api_success(101), 101, $data);
        } catch (Exception $e) {

            return $this->sendError($e->getMessage(), $e->getCode());
        }
    }
}
