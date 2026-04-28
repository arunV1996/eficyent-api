<?php

namespace App\Enums;

enum TelegramEvent: string
{
    case BENEFICIARY_TRANSACTION_CREATED = 'Beneficiary Transaction Created';
    case DEPOSIT_RECEIVED               = 'Deposit Received';
    case CALLBACK_RECEIVED              = 'Callback Received';
    case USER_REPORT_ALERT              = 'User Report Alert';
    case PROCESSING_UNIT_INITIATION_FAILED = 'Processing Unit Initiation Failed';
}
