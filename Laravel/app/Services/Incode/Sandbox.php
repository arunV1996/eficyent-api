<?php

namespace App\Services\Incode;

use Carbon\Carbon;
use Faker\Factory as Faker;

class Sandbox
{
    public static function omni_start($payload)
    {

        $faker = Faker::create();

        return [
            "success" => true,
            "message" => "success",
            "code" => 200,
            "data" => [
                [
                    "interviewId" => $faker->uuid,
                    "token" => $faker->uuid,
                    "interviewCode" => "FHIDLE",
                    "flowType" => "flow",
                    "idCaptureTimeout" => 25,
                    "idDetectionTimeout" => 60,
                    "selfieCaptureTimeout" => 25,
                    "idCaptureRetries" => 3,
                    "selfieCaptureRetries" => 3,
                    "curpValidationRetries" => 1,
                    "clientId" => "heraldex256",
                    "env" => "demo",
                    "existingSession" => false,
                    "optinEnabled" => false,
                    "optinCompanyName" => "",
                    "onboardingLinkExpirationMinutes" => 15
                ]
            ]
        ];
    }

    public static function get_url($payload)
    {

        return [
            "success" => true,
            "message" => "success",
            "code" => 200,
            "data" => [
                "url" => "https://sandbox.incode.com.mx/"
            ]
        ];
    }

    public static function get_score($payload)
    {
        return [
            "success" => true,
            "message" => "success",
            "code" => 200,
            "data" => [
                "idValidation" => [
                    "photoSecurityAndQuality" => [
                        ["value" => "PASSED", "status" => "OK", "key" => "idAlterationCheck"],
                        ["value" => "PASSED", "status" => "OK", "key" => "alignment"],
                        ["value" => "OK", "status" => "OK", "key" => "screenIdLiveness"],
                        ["value" => "OK", "status" => "OK", "key" => "paperIdLiveness"],
                        ["value" => "PASSED", "status" => "OK", "key" => "idAlreadyUsedCheck"],
                        ["value" => "86", "status" => "OK", "key" => "balancedLightFront"],
                        ["value" => "87", "status" => "OK", "key" => "balancedLightBack"],
                        ["value" => "80", "status" => "OK", "key" => "sharpnessFront"],
                        ["value" => "91", "status" => "OK", "key" => "sharpnessBack"],
                        ["value" => "PASSED", "status" => "OK", "key" => "fakeBrowserCheck"],
                        ["value" => "PASSED", "status" => "OK", "key" => "fakeIdCheck"],
                        ["value" => "PASSED", "status" => "OK", "key" => "visibleIdCharacteristicsFront"],
                        ["value" => "PASSED", "status" => "OK", "key" => "visibleIdCharacteristicsBack"],
                    ],
                    "idSpecific" => [
                        ["value" => "100", "status" => "OK", "key" => "documentTypeSideCrosscheck"],
                        ["value" => "100", "status" => "OK", "key" => "documentClassification"],
                        ["value" => "100", "status" => "OK", "key" => "documentSeriesExpired"],
                        ["value" => "100", "status" => "OK", "key" => "birthDateValidity"],
                        ["value" => "100", "status" => "OK", "key" => "visiblePhotoFeatures"],
                    ],
                    "overall" => [
                        "value" => "100.0",
                        "status" => "OK",
                    ],
                ],
                "idOcrConfidence" => [
                    "overallConfidence" => [
                        "value" => "97.3",
                        "status" => "OK",
                    ]
                ],
                "deviceRisk" => [
                    "overall" => [
                        "status" => "OK"
                    ]
                ],
                "retryInfo" => [],
                "documentOnEdgeInfo" => [
                    "frontDocumentIsOnTheEdge" => false,
                    "backDocumentIsOnTheEdge" => false
                ],
                "sessionRecording" => [
                    "mergedRecordingQualityChecks" => []
                ],
                "reasonMsg" => "This session passed because it passed all of Incode's tests: ID Verification",
                "overall" => [
                    "value" => "100.0",
                    "status" => "OK"
                ]
            ]
        ];
    }
}
