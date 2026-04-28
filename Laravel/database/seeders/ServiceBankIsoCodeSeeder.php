<?php

namespace Database\Seeders;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ServiceBankIsoCodeSeeder extends Seeder
{
    public function run()
    {
        $banks = [

            // Pakistan Banks
            'AL BARAKA BANK LTD' => 'AIINPKKAXXX',
            'ALLIED BANK PAKISTAN' => 'ABPAPKKAXXX',
            'ALLIED SAVINGS BANK' => 'ALSGPHM1XXX',
            'BANK AL FALAH LIMITED' => 'ALFHPKKAXXX',
            'BANK AL HABIB LIMITED' => 'BAHLPKKAXXX',
            'BANK ISLAMI PAKISTAN LTD' => 'BKIPPKKAXXX',
            'BANK OF PUNJAB' => 'BPUNPKKAXXX',
            'BURJ BANK' => 'BURJPKKAXXX',
            'CITI BANK PAK' => 'CITIPKKXXX',
            'DEUTSCHE BANK AG' => 'DEUTPKKAXXX',
            'DUBAI ISLAMIC BANK PAKISTAN' => 'DUIBPKKAXXX',
            'FAYSAL BANK LIMITED' => 'FAYSPKKAXXX',
            'FIRST MICRO FINANCE BANK LIMITED' => 'HBLMFBXXX',
            'FIRST WOMEN BANK LIMITED' => 'FWOMPKKAXXX',
            'HABIB BANK LTD' => 'HABBPCKKAXXX',
            'HABIB METROPOLITAN BANK LTD' => 'MPBLPKKAXXX',
            'JS BANK LIMITED' => 'JSBLPKKAXXX',
            'KHUSHHALI MICROFINANCE BANK' => 'KMBLPKKAXXX',
            'MEEZAN BANK LIMITED' => 'MEZNPKKAXXX',
            'MIB MUSLIM ISLAMIC BANK LIMITED' => 'MCIBPKKIXXX',
            'MUSLIM COMMERCIAL BANK' => 'MUCBPKKAXXX',
            'NATIONAL BANK OF PAKISTAN' => 'NBPAPKKAXXX',
            'NRSP BANK' => 'NRSPMFBBXXX',
            'SAMBA BANK LIMITED' => 'SAMBPKKAXXX',
            'SILK BANK' => 'SAUDPKKAXXX',
            'SINDH BANK LIMITED' => 'SIDDPKKAXXX',
            'SME BANK LTD PAKISTAN' => 'SMESPKK1XXX',
            'SONERI BANK LIMITED' => 'SONEPKKAXXX',
            'STANDARD CHARTERED BANK PAKISTAN' => 'SCBLPKKAXXX',
            'THE BANK OF KHYBER' => 'KHYBPKKAXXX',
            'U MICROFINANCE BANK' => 'UMBLPKKAXXX',
            'UNITED BANK LIMITED PAK' => 'UNILPKKAXXX',
            'ZARAI TARAQIATI BANK LIMITED' => 'ZTBLPKKAXXX',
            'Bank Makramah Limited(Summit Bank Limited)' => 'SUMBPKKAXXX',

            // Nepal Banks
            'ACE DEVELOPMENT BANK LIMITED' => 'ACDENPKA',
            'AGRICULTURAL DEVELOPMENT BANK NEPAL' => 'ADBLNPKA',
            'BANK OF ASIA NEPAL LIMITED' => 'BOALNPKA',
            'BANK OF KATHMANDU LUMBINI LTD.' => 'BOKLNPKA',
            'CITIZENS BANK INTERNATIONAL LTD' => 'CTZNNPKA',
            'EVEREST BANK LTD' => 'EVBLNPKA',
            'IME NEPAL' => 'GLBBNPKA',
            'HIMALAYAN BANK' => 'HIMANPKA',
            'JYOTI BIKASH BANK LTD' => 'JBBLNPKA',
            'JANATA BANK NEPAL LIMITED' => 'JBNLNPKA',
            'KASTHAMANDAP DEVELOPMENT BANK LTD' => 'KDBLNPKAXXX',
            'KUMARI BANK LIMITED' => 'KMBLNPKA',
            'LAXMI SUNRISE BANK' => 'LXBLNPKA',
            'MACHHAPUCHCHHRE BANK LIMITED' => 'MBLNNPKA',
            'MUKTINATH BIKAS BANK LTD' => 'MNBBLNPKA',
            'NABIL BANK LIMITED' => 'NARBNPKA',
            'NEPAL BANK LIMITED' => 'NEBLNPKA',
            'NEPAL INVESTMENT MEGA BANK LTD' => 'NIBLNPKT',
            'NIC ASIA BANK LTD' => 'NICENPKA',
            'NMB BANK' => 'NMBBNPKA',
            'NEPAL SBI BANK LIMITED' => 'NSBINPKA',
            'PRIME COMMERCIAL BANK' => 'PCBLNPKA',
            'PRABHU BANK' => 'PRVUNPKA',
            'RASTRIYA BANIJYA BANK' => 'RBBANPKA',
            'STANDARD CHARTERED BANK NEPAL' => 'SCBLNPKA',
            'SIDDHARTHA BANK LIMITED' => 'SIDDNPKA',
            'SANIMA BANK LTD' => 'SNMANPKA',
            'SUNRISE BANK LIMITED' => 'SRBLNPKAXXX',
            'SHINE RESUNGA DEVELOPMENT BANK LTD' => 'SRDBNPKA',
            'TOURISM DEVELOPMENT BANK NEPAL LTD' => 'TDBLNPKA',
        ];

        foreach ($banks as $bankName => $isoCode) {
            DB::table('service_banks')
                ->whereRaw('LOWER(bank_name) = ?', [strtolower($bankName)])
                ->update([
                    'iso_code' => $isoCode
                ]);
        }
    }
}
