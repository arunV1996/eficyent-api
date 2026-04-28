<?php

namespace App\ExternalServices\Onboarding\Caliza;

use App\Contracts\Onboarding\OnboardingContract;
use App\Models\UserService;
use App\Services\Caliza\OnboardingService;
use Exception;

class CalizaOnboarding implements OnboardingContract
{
    public function make($user)
    {

        $payload = $this->preparepayload($user);

        $onboardingservice = new OnboardingService();

        $response = $onboardingservice->onboarding($payload);

        throw_if(!$response['success'], new Exception($response['message']));

        $this->updateuser($response, $user);

        return $response;
    }

    public function updateuser($response, $user)
    {
        if (isset($response['data']) && isset($response['data']['status']) && isset($response['data']['id'])) {

            UserService::updateOrCreate(
                [
                    'user_id' => $user->id,
                    'service_type' => EXTERNAL_TYPE_CALIZA
                ],
                [
                    'external_reference_id' => $response['data']['id'] ?? null,
                    'external_data' => json_encode($response['data']),
                    'external_status' => $response['data']['status'] ?? null,
                    'status' => format_caliza_onboarding_status($response['data']['status']),
                ]
            );
        }
    }

    public function status($user)
    {

        $payload['external_reference_id'] = $user->userServices()->where('service_type', EXTERNAL_TYPE_CALIZA)->first()->external_reference_id ?? null;

        $onboardingservice = new OnboardingService();

        $response = $onboardingservice->get($payload);

        throw_if(!$response['success'], new Exception($response['message']));

        $this->updateuser($response, $user);

        return $response['data'];
    }

    public function preparepayload($user)
    {
        $payload = [];

        if ($user->user_type == USER_TYPE_INDIVIDUAL) {

            $payload = [
                'integratorBeneficiaryId' => $user->unique_id,
                'user_type' => $user->user_type,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'mobile' => "+" . $user->mobile_country_code . $user->mobile,
                'dob' => $user->dob,
                'address_1' => $user->userInformation->address_1 ?? '',
                'address_2' => $user->userInformation->address_2 ?? '',
                'city' => $user->userInformation->city ?? '',
                'state' => normalizeState($user->userInformation->state) ?? '',
                'zipcode' => $user->userInformation->postal_code ?? '',
                'country' => $user->userInformation->country ? get_alpha2_code($user->userInformation->country) : '',
                'citizenship' => $user->userInformation->country ?? '',
                'id_number' => $user->userInformation->id_number ?? '',
            ];
        }

        if ($user->user_type == USER_TYPE_BUSINESS) {

            $payload = [
                'integratorBeneficiaryId' => $user->unique_id,
                'user_type' => $user->user_type,
                'business_name' => $user->userInformation->business_name ?? '',
                'formation_date' => $user->userInformation->formation_date ?? '',
                'tax_id' => $user->userInformation->tax_id ?? '',
                'mobile' => "+" . $user->mobile_country_code . $user->mobile,
                'email' => $user->email,
                'website' => $user->userInformation->website ?? '',
                'address_1' => $user->userInformation->address_1 ?? '',
                'address_2' => $user->userInformation->address_2 ?? '',
                'city' => $user->userInformation->city ?? '',
                'state' => normalizeState($user->userInformation->state) ?? '',
                'zipcode' => $user->userInformation->postal_code ?? '',
                'country' => $user->userInformation->country ? get_alpha2_code($user->userInformation->country) : '',
            ];

            $contacts = $user->userInformation->business_persons ?? [];

            foreach ($contacts as $contact) {

                $payload['business']['contacts'][] = [
                    'first_name' => $contact['first_name'] ?? '',
                    'last_name' => $contact['last_name'] ?? '',
                    'dob' => $contact['dob'] ?? '',
                    'email' => $contact['email'] ?? '',
                    'mobile' => "+" . $contact['mobile_country_code'] . $contact['mobile'],
                    'id_number' => $contact['id_number'] ?? '',
                    'address_1' => $contact['address_1'] ?? '',
                    'address_2' => $contact['address_2'] ?? '',
                    'city' => $contact['city'] ?? '',
                    'state' => normalizeState($contact['state']) ?? '',
                    'zipcode' => $contact['postal_code'] ?? '',
                    'country' => $contact['country'] ? get_alpha2_code($contact['country']) : '',
                    'citizenship' => $contact['country'] ?? '',
                    'profession' => $contact['profession'] ?? '',
                ];
            }
        }

        return $payload;
    }
}
