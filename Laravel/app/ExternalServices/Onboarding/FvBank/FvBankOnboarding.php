<?php

namespace App\ExternalServices\Onboarding\FvBank;

use Exception;
use App\Models\UserService;
use App\Services\FvBank\FvBank;
use Illuminate\Support\Facades\Log;
use App\Services\FvBank\OnboardingService;
use App\Contracts\Onboarding\OnboardingContract;

use function Laravel\Prompts\info;

class FvBankOnboarding extends FvBank implements OnboardingContract
{
    /**
     * Call FV Bank onboarding microservice
     */
    public function make($user)
    {

        if (!config('services.fv_bank_micro.is_enabled')) {

            return false;
        }
        $onboardingService = new OnboardingService();

        $check_already_onboarded = $onboardingService->usersList();

        $check_user_exists = $this->getUser($user,$check_already_onboarded);

        if (!$check_user_exists) {

            $response = (new OnboardingService())->onboarding($this->preparePayload($user));

            if (!($response['success'] ?? false)) {

                throw new Exception($response['message'] ?? 'Onboarding failed');
            }
        }else{

            $response = $check_user_exists;
        }
        
        $this->updateUser($response, $user);

        return $response;
    }

    public function getUser($user, $usersList)
    {
        if (empty($usersList['success']) || empty($usersList['data']['Users']['Data']) || !is_array($usersList['data']['Users']['Data'])) {
            return null;
        }

        foreach ($usersList['data']['Users']['Data'] as $userList) {

            if ( isset($userList['Beneficiary_Email']) && strcasecmp($userList['Beneficiary_Email'], $user->email) === 0 ) {

                return $userList;
            }
        }

        return null;
    }


    public function preparePayload($user)
    {
        $payload = [];

        if ($user->user_type == USER_TYPE_INDIVIDUAL) {

            $payload = [
                'type' => 'individual',
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'mobile' => "+" . $user->mobile_country_code . $user->mobile,
                'address' => trim(($user->userInformation->address_1 ?? '') . ' ' .($user->userInformation->address_2 ?? '')),
                'city' => $user->userInformation->city ?? '',
                'state' => normalizeState($user->userInformation->state) ?? '',
                'postal_code' => $user->userInformation->postal_code ?? '',
                'country' => $user->userInformation->country ? get_alpha2_code($user->userInformation->country) : '',
            ];
        }
        if ($user->user_type == USER_TYPE_BUSINESS) {

            $payload = [
                'type' => 'business',
                'company_name' => $user->userInformation->business_name ?? '',
                'email' => $user->email,
                'address' => trim(($user->userInformation->address_1 ?? '') . ' ' .($user->userInformation->address_2 ?? '')),
                'city' => $user->userInformation->city ?? '',
                'state' => normalizeState($user->userInformation->state) ?? '',
                'postal_code' => $user->userInformation->postal_code ?? '',
                'country' => $user->userInformation->country ? get_alpha2_code($user->userInformation->country) : '',
            ];
        }

        return $payload;
    }

    public function updateuser(array $response, $user): void
    {
        if ((($response['success'] ?? false) && ($response['code'] ?? null) == 200 && !empty($response['data']['BeneficiaryId'])) || $response['Id']) {

            try {

                $data = $response['data'] ?? $response ?? [];

                UserService::updateOrCreate(
                    [
                        'user_id'      => $user->id,
                        'service_type' => EXTERNAL_TYPE_FVBANK,
                    ],
                    [
                        'external_reference_id' => $data['BeneficiaryId'] ?? $data['Id'],
                        'external_data'         => json_encode($data),
                        'external_status'       => 'INITIATED',
                        'status'                => FV_BANK_ONBOARDING_INITIATED,
                    ]
                );
            } catch (Exception $e) {

                Log::error('FV Bank onboarding save failed', ['error' => $e->getMessage()]);
            }
        }
    }
}
