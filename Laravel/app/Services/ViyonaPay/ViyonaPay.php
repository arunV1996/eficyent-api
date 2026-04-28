<?php

namespace App\Services\ViyonaPay;

use App\Helpers\ExternalServiceLogger;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use phpseclib3\Crypt\RSA;
use phpseclib3\Crypt\PublicKeyLoader;

abstract class ViyonaPay
{
    protected string $baseUrl;
    protected array $config;
    protected int $timeout = 120;

    public function __construct()
    {
        $this->config  = $this->loadConfig();
        $this->baseUrl = rtrim($this->config['url'], '/');
    }

    protected function loadConfig(): array
    {
        $cfg = config('services.viyona_pay');

        $required = [
            'url',
            'client_id',
            'client_secret',
            'client_api_key',
            'client_private_key_path',
            'server_public_key_path',
            'client_api_type',
            'base_url'
        ];

        foreach ($required as $key) {

            throw_if(empty($cfg[$key]), new Exception("Service config missing: {$key}"));
        }

        return $cfg;
    }

    protected function request(string $endpoint, array $plainPayload, ?string $accessToken = null, array $service = []): array
    {

        $to_log = [
            'url'  => $this->baseUrl . $endpoint,
        ];

        $requestId  = (string) Str::uuid();

        $timestamp  = time();

        $sessionKey = random_bytes(32);

        $aadArray = [
            'client_id'  => $this->config['client_id'],
            'request_id' => $requestId,
            'timestamp'  => $timestamp,
        ];

        $aad = $this->canonical_json($aadArray);

        $to_log['plainPayload'] = $plainPayload;

        $encryptedData = $this->aesGcmEncrypt($plainPayload,  $sessionKey, $aad);

        $encryptedSessionKey = $this->rsaEncrypt($sessionKey);

        $body = [
            'client_id'             => $this->config['client_id'],
            'request_id'            => $requestId,
            'timestamp'             => $timestamp,
            'encrypted_data'        => $encryptedData,
            'encrypted_session_key' => $encryptedSessionKey,
        ];

        $to_log['body'] = $body;

        $signature = $this->sign($body);

        $response = Http::timeout($this->timeout)
            ->withHeaders(array_filter([
                'Accept'        => 'application/json',
                'Content-Type'  => 'application/json',
                'X-API-KEY'     => $this->config['client_api_key'],
                'X-API-TYPE'    => $this->config['client_api_type'],
                'X-REQUEST-ID'  => $requestId,
                'X-SIGNATURE'   => $signature,
                'Authorization' => $accessToken ? "Bearer {$accessToken}" : null,
            ]))
            ->post($this->baseUrl . $endpoint, array_merge($service, [
                'request_body' => $body,
            ]));

        $to_log['is_successful'] = $response->successful();


        // if (!$response->successful()) {

        //     throw new Exception($response->json()['result'] ?? tr('something_went_wrong'));
        // }

        $json = $response->json();

        if (empty($json['encrypted_data'])) {

            ExternalServiceLogger::create($this->baseUrl . $endpoint, $to_log, $response->json(), $response->status(), MODULE_VIYONA_PAY);

            throw new Exception('Encrypted response missing');
        }

        $decrypted = $this->aesGcmDecrypt($json['encrypted_data'],$sessionKey,$aad);

        $to_log['decrypted_response'] = $decrypted;

        ExternalServiceLogger::create($this->baseUrl . $endpoint, $to_log, $decrypted, $response->status(), MODULE_VIYONA_PAY);
        
        if (($decrypted['response_status'] ?? 0) !== 1) {

            throw new Exception($decrypted['result'] ?? 'Something went wrong');
        }

        return $decrypted;
    }

    protected function getAccessToken(): string
    {
        // return Cache::remember("viyona_pay_access_token", 1000, function () {

            $response = $this->request(
                VIYONAPAY_AUTH_TOKEN_ENDPOINT_V2,
                [
                    'client_secret' => $this->config['client_secret'],
                    'scopes'        => [$this->config['client_api_type']],
                ],
                null,
                [
                    'url' => $this->config['base_url'] . VIYONAPAY_AUTH_TOKEN_ENDPOINT,
                    'reference' => 'Get Access Token',
                ]
            );

            throw_if(empty($response['data']['access_token']), new Exception('Access token missing'));

            return $response['data']['access_token'];
        // });
    }

    protected function canonical_json(array $obj): string
    {
        ksort($obj);
        return json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function sign(array $payload): string
    {
        $pem = file_get_contents($this->config['client_private_key_path']);

        $privateKey = openssl_pkey_get_private($pem);

        throw_if(!$privateKey, new Exception('Invalid private key'));

        openssl_sign(
            $this->canonical_json($payload),
            $signature,
            $privateKey,
            OPENSSL_ALGO_SHA256
        );

        return base64_encode($signature);
    }

    private function rsaEncrypt(string $data): string
    {
        $pem = file_get_contents($this->config['server_public_key_path']);

        $rsa = PublicKeyLoader::load($pem)
            ->withPadding(RSA::ENCRYPTION_OAEP)
            ->withHash('sha256');

        return base64_encode($rsa->encrypt($data));
    }

    private function aesGcmEncrypt(array $payload, string $key, string $aad): string
    {
        if (strlen($key) !== 32) {
            throw new Exception('AES-256 requires 32-byte key');
        }

        $iv  = random_bytes(12);
        $tag = '';

        $plain = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        $cipher = openssl_encrypt(
            $plain,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $aad,
            16
        );

        if ($cipher === false) {
            throw new Exception('AES-GCM encryption failed');
        }

        return base64_encode($iv . $cipher . $tag);
    }

    private function aesGcmDecrypt(string $encryptedBase64, string $key, string $aad): array
    {
        Log::info("Encrypted: {$encryptedBase64}");

        $data = base64_decode($encryptedBase64, true);

        if ($data === false || strlen($data) < 30) {

            throw new Exception('Invalid encrypted payload');
        }

        $iv    = substr($data, 0, 12);
        $tag   = substr($data, -16);
        $crypt = substr($data, 12, -16);

        $plain = openssl_decrypt(
            $crypt,
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            $aad
        );

        if ($plain === false) {
            throw new Exception('AES-GCM decryption failed');
        }

        Log::info("Decrypted: {$plain}");

        return json_decode($plain, true);
    }
}
