<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class BusinessDocumentTypeSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $documents = [
            [
                'label' => 'Proof of Business Registration and Legal Existence',
                'value' => 'Proof_Of_Business_Registration',
            ],
            [
                'label' => 'Certificate of Incorporation',
                'value' => 'Cretificate_Of_Incorporation',
            ],
            [
                'label' => 'Business Registration Certificate',
                'value' => 'Business_Registration_Certificate',
            ],
            [
                'label' => 'Articles of Incorporation',
                'value' => 'Articles_Of_Incorporationn',
            ],
            [
                'label' => 'Bylaws',
                'value' => 'Bylaws',
            ],
            [
                'label' => 'Partnership Agreements',
                'value' => 'Partnership_Agreements',
            ],
            [
                'label' => 'Operating Agreement',
                'value' => 'Operating_Agreement',
            ],
        ];

        foreach ($documents as $doc) {
            DB::table('lookups')->updateOrInsert(
                [
                    'key'   => $doc['value'],
                    'type'  => LOOKUP_BUSINESS_VERIFICATION_TYPES,
                    'external_type' => EXTERNAL_TYPE_FVBANK,
                ],
                [
                    'unique_id' => Str::uuid()->toString(),
                    'value'     => $doc['label'],
                    'status'    => 1,
                    'created_at'=> $now,
                    'updated_at'=> $now,
                ]
            );
        }
    }
}
