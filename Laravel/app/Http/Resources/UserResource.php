<?php

namespace App\Http\Resources;

use App\Models\Merchant;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Crypt;

class UserResource extends JsonResource
{
    protected $method;
    public function __construct($resource, $method = null)
    {
        parent::__construct($resource);

        $this->method = $method;
    }
    /**
     * Transform the resource into an array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array|\Illuminate\Contracts\Support\Arrayable|\JsonSerializable
     */
    public function toArray($request)
    {

        $infoKey = $this->user_type == USER_TYPE_INDIVIDUAL ? 'user_information' : 'business_information';

        $merchant = Merchant::where('user_id', $this->id)->first();

        $is_merchant_user = $this->merchant_id ? "YES" : "NO";

        switch ($this->method) {

            case METHOD_REGISTER:

                return [
                    'unique_id' => $this->unique_id,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                    'user_type' => user_type_label($this->user_type),
                    'role' => user_role_label(TEAM_MEMBER_ROLE_ADMIN)
                ];

            case METHOD_VERIFY_EMAIL:

                return [
                    'unique_id' => $this->unique_id,
                    'email' => $this->email,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                ];

            case METHOD_LOGIN:

                return [
                    'unique_id' => $this->unique_id,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                    'user_type' => user_type_label($this->user_type),
                    'is_tfa_setup_completed' => tfa_status_label($this->is_tfa_setup_completed),
                    'is_tfa_enabled' => tfa_status_label($this->is_tfa_enabled),
                    'role' => user_role_label(TEAM_MEMBER_ROLE_ADMIN)
                ];

            case METHOD_GET_CREDENTIALS:

                return [
                    'unique_id' => $this->unique_id,
                    'api_key' => $this->api_key,
                    'salt_key'  => Crypt::decryptString($this->salt_key),
                    'private_key'  => Crypt::decryptString($this->private_key),
                ];

            case METHOD_PROFILE:

                return [
                    'unique_id' => $this->unique_id,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                    'user_type' => user_type_label($this->user_type),
                    'onboarding_step' => onboarding_step_label($this->onboarding_step),
                    'id_verification' => id_verification_status_label($this->id_verification),
                    'sender_enabled' => sender_status_label($this->enable_sender),
                    'is_tfa_setup_completed' => tfa_status_label($this->is_tfa_setup_completed),
                    'is_tfa_enabled' => tfa_status_label($this->is_tfa_enabled),
                    'tour_status' => tour_status_label($this->tour_status),
                    $infoKey => new UserInformationResource($this),
                    'documents' => UserDocumentResource::collection($this->userDocuments),
                    'role' => user_role_label(TEAM_MEMBER_ROLE_ADMIN),
                    'is_merchant' => $is_merchant_user 
                ];

            case METHOD_ONBOARDING_STEP_TWO:

                return [
                    'unique_id' => $this->unique_id,
                    'title' => $this->title,
                    'first_name' => $this->first_name,
                    'last_name' => $this->last_name,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                    'user_type' => user_type_label($this->user_type),
                    'dob' => $this->dob,
                    'onboarding_step' => onboarding_step_label($this->onboarding_step),
                    'id_verification' => id_verification_status_label($this->id_verification),
                    $infoKey => new UserInformationResource($this)
                ];

            case METHOD_ONBOARDING_STEP_THREE:

                return [
                    'onboarding_step' => onboarding_step_label($this->onboarding_step),
                    'documents' => UserDocumentResource::collection($this->userDocuments)
                ];

            case METHOD_USER_STATUS:

                return [

                    'name'       => $this->name,
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                    'id_verification' => id_verification_status_label($this->id_verification),
                    'is_merchant' => $is_merchant_user ,
                    'is_tfa_enabled' => tfa_status_label($this->is_tfa_enabled),
                    'is_tfa_setup_completed' => tfa_status_label($this->is_tfa_setup_completed),
                    'onboarding_step' => onboarding_step_label($this->onboarding_step),
                    'role' => user_role_label(TEAM_MEMBER_ROLE_ADMIN),
                    'sender_enabled' => sender_status_label($this->enable_sender),
                    'tour_status' => tour_status_label($this->tour_status),
                    'user_type' => user_type_label($this->user_type),
                    
                ];

            case METHOD_SUBUSER:

                return [
                    'unique_id' => $this->unique_id,
                    'title' => $this->title,
                    'first_name' => $this->first_name,
                    'last_name' => $this->last_name,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                    'onboarding_step' => onboarding_step_label($this->onboarding_step),
                    'id_verification' => id_verification_status_label($this->id_verification),
                    'email_status' => email_status_label(user_email_status_code($this->email_verified_at)),
                ];

            default:

                return [
                    'unique_id' => $this->unique_id,
                    'email' => $this->email,
                    'mobile_country_code' => $this->mobile_country_code,
                    'mobile' => $this->mobile,
                ];
        }
    }
}
