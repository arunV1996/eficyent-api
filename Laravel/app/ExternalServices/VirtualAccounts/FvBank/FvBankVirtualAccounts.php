<?php

namespace App\ExternalServices\VirtualAccounts\FvBank;

use Exception;
use App\Models\UserService;
use Illuminate\Support\Str;
use App\Models\VirtualAccount;
use Illuminate\Http\UploadedFile;
use App\Jobs\CreateVirtualAccountsJob;
use Illuminate\Support\Facades\Storage;
use App\Services\FvBank\VirtualAccountService;
use App\Contracts\VirtualAccounts\VirtualAccountContract;
use App\Helpers\Helper;
use App\Jobs\FetchFvBankVirtualAccountsJob;

class FvBankVirtualAccounts implements VirtualAccountContract
{
    private VirtualAccountService $service;

    public function __construct()
    {
        $this->service = new VirtualAccountService();
    }

    private function uploadedFileFromUrl(string $url): UploadedFile
    {
        $path = sys_get_temp_dir() . '/' . Str::random(12);

        file_put_contents($path, file_get_contents($url));

        return new UploadedFile($path, basename(parse_url($url, PHP_URL_PATH)), mime_content_type($path), null, true);
    }

    private function beneficiaryId($user): string
    {
        $id = UserService::where(['user_id' => $user->id, 'service_type' => EXTERNAL_TYPE_FVBANK])->value('external_reference_id');

        throw_if(!$id, new Exception(api_error(178), 178));

        return $id ?? "";
    }

    public function make($user)
    {
        if (!config('services.fv_bank_micro.is_enabled')) {

            return false;
        }

        $payload = ['beneficiary_id' => $this->beneficiaryId($user)];

        $check_account_exists = $this->service->getVirtualAccount($payload);

        if(!empty($check_account_exists['data']['VirtualAccounts'] && isset($check_account_exists['data']['VirtualAccounts']['Virtual_Account']))) {

            $virtualAccount = $check_account_exists['data']['VirtualAccounts']['Virtual_Account'];

            foreach ($virtualAccount['Deposit_Instructions'] as $instruction) {

                Helper::updateFvBankVirtualAccount($user, $instruction);
            }

            return;
        }

        $doc = $user->userDocuments()->latest()->first();

        throw_if(!$doc, new Exception('Document not found'));

        if ($user->user_type === USER_TYPE_INDIVIDUAL) {

            $front = $this->service->fileUpload($user, [
                'customField' => 'Front_Document',
                'file' => $this->uploadedFileFromUrl($doc->document_file),
            ]);

            $back = $this->service->fileUpload($user, [
                'customField' => 'Back_Document',
                'file' => $this->uploadedFileFromUrl($doc->document_back_file),
            ]);

            throw_if(!$front['success'] || !$back['success'], new Exception('Document upload failed'));

            $response = $this->service->create([
                'type'                           => 'individual',
                'beneficiary_id'                 => $this->beneficiaryId($user),
                'beneficiary_dob'                => $user->dob,
                'beneficiary_document_id_type'   => $user->userInformation->id_type === 'PASSPORT' ? 'passport' : 'Driving_License',
                'beneficiary_document_id_number' => $user->userInformation->id_number,
                'document_expiration'            => $doc->document_expiry_date,
                'beneficiary_front_document_id'  => $front['data']['ID'],
                'beneficiary_back_document_id'   => $back['data']['ID'],
            ]);

        } else {

            info("FvBank Business Account Creation for User ID: {$user->id}");

            $upload = $this->service->fileUpload($user, [
                'customField' => 'Document_File',
                'file' => $this->uploadedFileFromUrl($doc->document_file),
            ]);

            throw_if(!$upload['success'], new Exception('Document upload failed'));

            $response = $this->service->create([
                'type'                => 'business',
                'beneficiary_id'      => $this->beneficiaryId($user),
                'document_type'       => $user->userInformation->business_verification_type,
                'document_number'     => $user->userInformation->tax_id,
                'document_expiration' => $doc->document_expiry_date,
                'document_id'         => $upload['data']['ID'],
            ]);
        }

        if (!$response['success']) {

            info('FvBank Virtual Account Creation failed for User ID: ' . $user->id);

            return $response;
        }

        info('beneficiary_id: ' . print_r($payload, true));

        $vaResponse = $this->service->getVirtualAccount($payload);

        info('Virtual Account Details Response: ' . json_encode($vaResponse));

        if($vaResponse['success']) {

            $virtualAccount = $vaResponse['data']['VirtualAccounts'] ?? null;

            $depositInstructions = $virtualAccount['Virtual_Account']['Deposit_Instructions'] ?? [];

            info('Deposit Instructions: ' . json_encode($depositInstructions));

            if (empty($depositInstructions)) {

                FetchFvBankVirtualAccountsJob::dispatch($user->id)->delay(now()->addMinutes(3));

                return;
            }

            foreach ($depositInstructions as $instruction) {

                Helper::updateFvBankVirtualAccount($user, $instruction);
            }

            return $vaResponse;
        }
    }


    public function get($user)
    {
        $response = $this->service->getVirtualAccount($user);

        throw_if(!$response['success'], new Exception($response['message']));

        return $response;
    }

    public function get_balance($user, $virtual_account)
    {
        $beneficiaryId = $this->beneficiaryId($user);

        $response = $this->service->getVirtualAccountBalance($beneficiaryId);

        throw_if(!$response['success'], new Exception($response['message']));

        return $response;
    }

}
