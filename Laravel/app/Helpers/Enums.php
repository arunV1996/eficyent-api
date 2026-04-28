<?php

function user_type_label($value): ?string
{
    return match ($value) {
        USER_TYPE_INDIVIDUAL => 'PERSONAL',
        USER_TYPE_BUSINESS => 'BUSINESS',
        default => null,
    };
}
function user_type_map(): array
{
    return [
        'PERSONAL' => USER_TYPE_INDIVIDUAL,
        'BUSINESS' => USER_TYPE_BUSINESS,
    ];
}
function onboarding_step_map(): array
{
    return [
        'REGISTER_USER' => ONBOARDING_STEP_ONE_COMPLETED,
        'GET_INFORMATION'  => ONBOARDING_STEP_TWO_COMPLETED,
        'GET_DOCUMENTS'    => ONBOARDING_STEP_THREE_COMPLETED,
        'KYX'          => ONBOARDING_STEP_FOUR_COMPLETED,
    ];
}

function onboarding_step_label($value): ?string
{
    return match ($value) {
        ONBOARDING_STEP_ONE_COMPLETED => 'REGISTERED',
        ONBOARDING_STEP_TWO_COMPLETED => 'INFORMATION_UPDATED',
        ONBOARDING_STEP_THREE_COMPLETED => 'DOCUMENTS_UPLOADED',
        ONBOARDING_STEP_FOUR_COMPLETED => 'ONBOARDING_COMPLETED',
        default => null,
    };
}

function email_status_label($value): ?string
{
    return match ($value) {
        EMAIL_VERIFIED => 'VERIFIED',
        EMAIL_NOT_VERIFIED => 'NOT_VERIFIED',
        default => null,
    };
}

function id_verification_status_label($value): ?string
{
    return match ($value) {
        IDENTITY_VERIFICATION_PENDING => 'PENDING',
        IDENTITY_VERIFICATION_INITIATED => 'INITIATED',
        IDENTITY_VERIFICATION_PROCESSING => 'PROCESSING',
        IDENTITY_VERIFICATION_FAILED => 'FAILED',
        IDENTITY_VERIFICATION_COMPLETED => 'COMPLETED',
        default => null,
    };
}

function sender_status_label($value): ?string
{
    return match ($value) {
        ACTIVE => 'YES',
        INACTIVE => 'NO',
        default => null,
    };
}

function tfa_status_label($value): ?string
{
    return match ($value) {
        ACTIVE => 'YES',
        INACTIVE => 'NO',
        default => null,
    };
}

function user_role_label($value): ?string
{
    return match ($value) {
        TEAM_MEMBER_ROLE_ADMIN => 'ADMIN',
        TEAM_MEMBER_ROLE_OWNER => 'OWNER',
        TEAM_MEMBER_ROLE_SUPPORT_MEMBER => 'TEAM_MEMBER',
        TEAM_MEMBER_ROLE_CORPORATE => 'CORPORATE',
        default => null,
    };
}

function user_role_map(): array
{
    return [
        'ADMIN' => TEAM_MEMBER_ROLE_ADMIN,
        'OWNER' => TEAM_MEMBER_ROLE_OWNER,
        'TEAM_MEMBER' => TEAM_MEMBER_ROLE_SUPPORT_MEMBER,
        'CORPORATE' => TEAM_MEMBER_ROLE_CORPORATE,
    ];
}

function virtual_account_status_label($value): ?string
{
    return match ($value) {
        VIRTUAL_ACCOUNT_STATUS_PENDING => 'PENDING',
        VIRTUAL_ACCOUNT_STATUS_CREATED => 'CREATED',
        VIRTUAL_ACCOUNT_STATUS_FAILED => 'FAILED',
        default => null,
    };
}

function virtual_account_status_map(): array
{
    return [
        'PENDING' => VIRTUAL_ACCOUNT_STATUS_PENDING,
        'CREATED' => VIRTUAL_ACCOUNT_STATUS_CREATED,
        'FAILED' => VIRTUAL_ACCOUNT_STATUS_FAILED,
    ];
}

function beneficiary_transaction_status_label($value): ?string
{
    return match ($value) {
        BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL => 'WAITING_FOR_APPROVAL',
        BENEFICIARY_TRANSACTION_APPROVED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_INITIATED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_PROCESSING => 'PROCESSING',
        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD => 'PROCESSING',
        BENEFICIARY_TRANSACTION_COMPLETED => 'COMPLETED',
        BENEFICIARY_TRANSACTION_FAILED => 'FAILED',
        BENEFICIARY_TRANSACTION_CANCELLED => 'CANCELLED',
        BENEFICIARY_TRANSACTION_EXPIRED => 'EXPIRED',
        BENEFICIARY_TRANSACTION_REJECTED => 'REJECTED',
        BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED => 'REJECTED',
        BENEFICIARY_TRANSACTION_CORPORATE_INITIATED => 'CORPORATE_INITIATED',
        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING => 'PROCESSING',
        BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED => 'PROCESSING',
        BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED => 'PROCESSING',
        default => null,
    };
}

function beneficiary_transaction_status_map(): array
{
    return [
        'WAITING_FOR_APPROVAL' => BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
        'APPROVED' => BENEFICIARY_TRANSACTION_APPROVED,
        'INITIATED' => BENEFICIARY_TRANSACTION_INITIATED,
        'PROCESSING' => BENEFICIARY_TRANSACTION_PROCESSING,
        'COMPLETED' => BENEFICIARY_TRANSACTION_COMPLETED,
        'FAILED' => BENEFICIARY_TRANSACTION_FAILED,
        'CANCELLED' => BENEFICIARY_TRANSACTION_CANCELLED,
        'EXPIRED' => BENEFICIARY_TRANSACTION_EXPIRED,
        'REJECTED' => BENEFICIARY_TRANSACTION_REJECTED,
        'CORPORATE_INITIATED' => BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
    ];
}

function beneficiary_transaction_approval(): array
{
    return [
        'APPROVED' => BENEFICIARY_TRANSACTION_APPROVED,
        'REJECTED' => BENEFICIARY_TRANSACTION_REJECTED,
    ];
}

function beneficiary_account_status_label($value): ?string
{
    return match ($value) {
        BENEFICIARY_ACCOUNT_PENDING => 'PENDING',
        BENEFICIARY_ACCOUNT_ACTIVATED => 'ACTIVATED',
        BENEFICIARY_ACCOUNT_DEACTIVATED => 'DEACTIVATED',
        BENEFICIARY_ACCOUNT_BLOCKED => 'BLOCKED',
        default => null,
    };
}

function beneficiary_account_status_map(): array
{
    return [
        'PENDING' => BENEFICIARY_ACCOUNT_PENDING,
        'ACTIVATED' => BENEFICIARY_ACCOUNT_ACTIVATED,
        'DEACTIVATED' => BENEFICIARY_ACCOUNT_DEACTIVATED,
        'BLOCKED' => BENEFICIARY_ACCOUNT_BLOCKED,
    ];
}

function remitter_status_label($value): ?string
{
    return match ($value) {
        SENDER_STATUS_APPROVED => 'APPROVED',
        SENDER_STATUS_EXPIRED => 'EXPIRED',
        SENDER_STATUS_PENDING => 'PENDING',
        SENDER_STATUS_REJECTED => 'REJECTED',
        default => null,
    };
}

function remitter_status_map(): array
{
    return [
        'APPROVED' => SENDER_STATUS_APPROVED,
        'EXPIRED' => SENDER_STATUS_EXPIRED,
        'PENDING' => SENDER_STATUS_PENDING,
        'REJECTED' => SENDER_STATUS_REJECTED,
        'DISABLED' => SENDER_STATUS_DISABLED,
    ];
}

function deposit_transaction_status_label($value): ?string
{
    return match ($value) {
        DEPOSIT_TRANSACTION_PENDING => 'PROCESSING',
        DEPOSIT_TRANSACTION_COMPLETED => 'COMPLETED',
        DEPOSIT_TRANSACTION_FAILED => 'FAILED',
        DEPOSIT_TRANSACTION_REJECTED => 'FAILED',
        DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING => 'PROCESSING',
        DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED => 'PROCESSING',
        default => null,
    };
}

function deposit_transaction_status_map(): array
{
    return [
        'PROCESSING' => DEPOSIT_TRANSACTION_PENDING,
        'COMPLETED' => DEPOSIT_TRANSACTION_COMPLETED,
        'FAILED' => DEPOSIT_TRANSACTION_FAILED,
    ];
}
function transaction_type_label($value): ?string
{
    return match ($value) {
        TRANSACTION_TYPE_CREDIT => 'CREDIT',
        TRANSACTION_TYPE_DEBIT => 'DEBIT',
        default => null,
    };
}

function transaction_type_map(): array
{
    return [
        'CREDIT' => TRANSACTION_TYPE_CREDIT,
        'DEBIT' => TRANSACTION_TYPE_DEBIT,
    ];
}

function user_permission_label($value): ?string
{
    return match ($value) {
        TEAM_MEMBER_PERMISSION_CHECKER => 'APPROVER',
        TEAM_MEMBER_PERMISSION_INITIATOR => 'INITIATOR',
        TEAM_MEMBER_PERMISSION_MAKER => 'CREATOR',
        TEAM_MEMBER_PERMISSION_MAKER_CHECKER => 'CREATOR_AND_APPROVER',
        default => null,
    };
}

function user_permission_map(): array
{
    return [
        'APPROVER' => TEAM_MEMBER_PERMISSION_CHECKER,
        'INITIATOR' => TEAM_MEMBER_PERMISSION_INITIATOR,
        'CREATOR' => TEAM_MEMBER_PERMISSION_MAKER,
        'CREATOR_AND_APPROVER' => TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
    ];
}

function team_member_status_label($value): ?string
{
    return match ($value) {
        TEAM_MEMBER_ACTIVE => 'ACTIVE',
        TEAM_MEMBER_INACTIVE => 'INACTIVE',
        TEAM_MEMBER_DISABLED => 'DISABLED',
        default => null,
    };
}

function team_member_status_map(): array
{
    return [
        'ACTIVE' => TEAM_MEMBER_ACTIVE,
        'INACTIVE' => TEAM_MEMBER_INACTIVE,
        'DISABLED' => TEAM_MEMBER_DISABLED,
    ];
}

function wallet_status_label($value): ?string
{
    return match ($value) {
        WALLET_STATUS_ACTIVE => 'ACTIVE',
        WALLET_STATUS_INACTIVE => 'INACTIVE',
        default => null,
    };
}

function wallet_status_map(): array
{
    return [
        'ACTIVE' => WALLET_STATUS_ACTIVE,
        'INACTIVE' => WALLET_STATUS_INACTIVE,
    ];
}

function wallet_transaction_status_label($value): ?string
{
    return match ($value) {
        WALLET_TRANSACTION_PENDING => 'PENDING',
        WALLET_TRANSACTION_COMPLETED => 'COMPLETED',
        WALLET_TRANSACTION_FAILED => 'FAILED',
        WALLET_TRANSACTION_REJECTED => 'REJECTED',
        WALLET_TRANSACTION_CANCELLED => 'CANCELLED',
        default => null,
    };
}

function tour_status_label($value): ?string
{
    return match ($value) {
        ACTIVE => 'COMPLETED',
        INACTIVE => 'PENDING',
        default => null,
    };
}

function onboarding_status_label($value): ?string
{
    return match ($value) {
        ONBOARDING_STATUS_PENDING => 'PENDING',
        ONBOARDING_STATUS_INITIATED => 'INITIATED',
        ONBOARDING_STATUS_CREATED => 'CREATED',
        ONBOARDING_STATUS_FAILED => 'FAILED',
        default => null,
    };
}

function onboarding_status_map(): array
{
    return [
        'PENDING' => ONBOARDING_STATUS_PENDING,
        'INITIATED' => ONBOARDING_STATUS_INITIATED,
        'CREATED' => ONBOARDING_STATUS_CREATED,
        'FAILED' => ONBOARDING_STATUS_FAILED,
    ];
}

function transaction_proof_status_label($value): ?string
{
    return match ($value) {
        PAYMENT_PROOF_REQUESTED => 'REQUESTED',
        PAYMENT_PROOF_UPLOADED => 'PROVIDED',
        PAYMENT_PROOF_REJECTED => 'REJECTED',
        default => null,
    };
}

function deposit_type_map(): array
{
    return [
        'CREDIT' => DEPOSIT_TYPE_CREDIT,
        'TOPUP' => DEPOSIT_TYPE_TOPUP,
    ];
}