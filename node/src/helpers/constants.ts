// Mirror of Laravel/app/Constants/constants.php. Names are kept identical.

export const NO = 0;
export const YES = 1;
export const ACTIVE = 1;
export const INACTIVE = 0;

export const USER_DECLINED = 0;
export const USER_APPROVED = 1;
export const USER_PENDING = 2;

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const USER_TYPE_PENDING = 0;
export const USER_TYPE_INDIVIDUAL = 1;
export const USER_TYPE_BUSINESS = 2;

export const ONBOARDING_STEP_ONE_COMPLETED = 1;

export const INTERNAL_API_TOKEN = "internal-api-token";
export const AUTHENTICATION_ABILITY = "authentication";
export const ENCRYPTION_ABILITY = "encryption";
export const EXTERNAL_API_TOKEN = "external-api-token";

export const METHOD_REGISTER = "register";
export const METHOD_LOGIN = "login";

export const MERCHANT_TYPE_PAYOUT = 1;
export const MERCHANT_TYPE_WHITELABEL = 2;
export const MERCHANT_TYPE_PAYOUTINTEGRATOR = 3;
export const MERCHANT_TYPE_PAYINCOLLECTION = 4;

export const BUSINESS_MODEL_MTO = "mto";
export const BUSINESS_MODEL_B2B = "B2B";
export const BUSINESS_MODEL_COLLECTION = "COLLECTION";
export const BUSINESS_MODEL_DEAL_BASED = "DEAL_BASED";

export const SUPPORTED_USER_INDIVIDUAL = "individual";
export const SUPPORTED_USER_BUSINESS = "business";
export const SUPPORTED_USER_INDIVIDUAL_AND_BUSINESS = "individual_and_business";

export const BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL = 0;
export const BENEFICIARY_TRANSACTION_APPROVED = 1;
export const BENEFICIARY_TRANSACTION_INITIATED = 2;
export const BENEFICIARY_TRANSACTION_PROCESSING = 3;
export const BENEFICIARY_TRANSACTION_COMPLETED = 4;
export const BENEFICIARY_TRANSACTION_FAILED = 5;
export const BENEFICIARY_TRANSACTION_REJECTED = 7;
export const BENEFICIARY_TRANSACTION_CANCELLED = 8;
export const BENEFICIARY_TRANSACTION_CORPORATE_INITIATED = 9;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED = 10;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED = 11;

export const PAYOUT_JOB_STATUS_PENDING = 0;
export const PAYOUT_JOB_STATUS_PROCESSING = 1;
export const PAYOUT_JOB_STATUS_COMPLETED = 2;
export const PAYOUT_JOB_STATUS_FAILED = 3;

export const ACTION_BY_USER = "user";
export const ACTION_BY_ADMIN = "admin";
export const ACTION_BY_SYSTEM = "system";
export const ACTION_BY_TEAM = "team";

export const TRANSACTION_MODE_APPROVAL = 1;
export const TRANSACTION_MODE_DIRECT = 2;

export const ENABLED = 1;
export const DISABLED = 0;

export const EMAIL_VERIFIED = 1;
export const EMAIL_NOT_VERIFIED = 0;

export const METHOD_VERIFY_EMAIL = "verify_email";
export const METHOD_GET_CREDENTIALS = "get_credentials";
export const METHOD_PROFILE = "profile";
export const METHOD_USER_STATUS = "user_status";
export const METHOD_SUBUSER = "subuser";

export const Mr = "Mr";
export const Mrs = "Mrs";
export const Miss = "Miss";

export const IDENTITY_VERIFICATION_PENDING = 1;
export const IDENTITY_VERIFICATION_INITIATED = 2;
export const IDENTITY_VERIFICATION_PROCESSING = 3;
export const IDENTITY_VERIFICATION_FAILED = 4;
export const IDENTITY_VERIFICATION_COMPLETED = 5;

export const ONBOARDING_STEP_FOUR_COMPLETED = 4;

export const TAKE_COUNT = 12;

export const LOOKUP_TYPE_SOURCE_OF_FUNDS = "source_of_funds";
export const LOOKUP_TYPE_PURPOSE_OF_TRANSACTION = "purpose_of_transaction";
export const LOOKUP_TYPE_BUSINESS_TYPE = "business_types";
export const LOOKUP_TYPE_PROFESSION = "professions";
export const LOOKUP_TYPE_SOURCE_OF_INCOME = "sources_of_incomes";
export const LOOKUP_TYPE_PAYMENT_METHOD = "payment_methods";
export const LOOKUP_BUSINESS_VERIFICATION_TYPES = "business_verification_types";
export const LOOKUP_TYPE_ADDRESS_TYPES = "address_types";
export const LOOKUP_TYPE_PROOF_OF_ADDRESS = "proof_of_address";
export const LOOKUP_TYPE_ID_TYPE = "id_types";
export const LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS = "purposes_of_transactions";
export const LOOKUP_TYPE_EEC_PAYMENT_PURPOSE = "eec_payment_purpose";
export const LOOKUP_TYPE_DOCUMENT_TYPES = "document_types";

export const PAYMENT_RAIL_WIRE = "wire";
export const PAYMENT_RAIL_SWIFT = "swift";
export const PAYMENT_RAIL_ACH = "ach";

export const BENEFICIARY_ACCOUNT_TYPE_CHECKING = "Checking";
export const BENEFICIARY_ACCOUNT_TYPE_SAVINGS = "Savings";
export const BENEFICIARY_ACCOUNT_TYPE_GENERAL_LEDGER = "GeneralLedger";
export const BENEFICIARY_ACCOUNT_TYPE_LOAN = "Loan";

export const EXTERNAL_TYPE_CALIZA = "ec";
export const EXTERNAL_TYPE_DIGININE = "ed";
export const EXTERNAL_TYPE_FVBANK = "ef";
export const EXTERNAL_TYPE_MASSIVE = "em";
export const EXTERNAL_TYPE_VIYONA_PAY = "ep";
export const EXTERNAL_TYPE_PROCESSING_UNIT = "pu";
export const EXTERNAL_TYPE_INCODE = "ei";
export const EXTERNAL_TYPE_INVOICEMATE = "im";
export const EXTERNAL_TYPE_COMPLIANCE = "cp";
export const EXTERNAL_TYPE_REPORT_SERVER = "rs";

export const C2C = "C2C";
export const C2B = "C2B";
export const B2C = "B2C";
export const B2B = "B2B";
export const RECIPIENT_TYPE_INDIVIDUAL = 1;
export const RECIPIENT_TYPE_BUSINESS = 2;

// Onboarding steps - same numeric value as `ONBOARDING_STEP_X_COMPLETED`.
export const ONBOARDING_STEP_ONE = 1;
export const ONBOARDING_STEP_TWO = 2;
export const ONBOARDING_STEP_THREE = 3;
export const ONBOARDING_STEP_FOUR = 4;
export const ONBOARDING_STEP_TWO_COMPLETED = 2;
export const ONBOARDING_STEP_THREE_COMPLETED = 3;

export const ONBOARDING_STATUS_PENDING = 0;
export const ONBOARDING_STATUS_INITIATED = 1;
export const ONBOARDING_STATUS_CREATED = 2;
export const ONBOARDING_STATUS_FAILED = 3;

export const VIRTUAL_ACCOUNT_STATUS_PENDING = 0;
export const VIRTUAL_ACCOUNT_STATUS_CREATED = 1;
export const VIRTUAL_ACCOUNT_STATUS_FAILED = 2;

export const COUNTRY_US = "US";
export const CURRENCY_USD = "USD";

export const BENEFICIARY_ACCOUNT_PENDING = 0;
export const BENEFICIARY_ACCOUNT_ACTIVATED = 1;
export const BENEFICIARY_ACCOUNT_DEACTIVATED = 2;
export const BENEFICIARY_ACCOUNT_BLOCKED = 3;

export const BENEFICIARY_ACCOUNT_VALIDATION_STATUS_PENDING = 0;
export const BENEFICIARY_ACCOUNT_VALIDATION_STATUS_SUCCESS = 1;
export const BENEFICIARY_ACCOUNT_VALIDATION_STATUS_FAILED = 2;

export const ID_VERIFIED_BY_ADMIN = "ad";
export const TEAM_MEMBER_ROLE_CORPORATE = 4;

export const METHOD_ONBOARDING_STEP_TWO = "onboarding_step_two";
export const METHOD_ONBOARDING_STEP_THREE = "onboarding_step_three";

// onboarding_step_map() - human key -> numeric step.
export const ONBOARDING_STEP_MAP: Record<string, number> = {
  REGISTER_USER: ONBOARDING_STEP_ONE,
  GET_INFORMATION: ONBOARDING_STEP_TWO_COMPLETED,
  GET_DOCUMENTS: ONBOARDING_STEP_THREE_COMPLETED,
};

// virtual_account_status_map() - human key -> numeric status.
export const VIRTUAL_ACCOUNT_STATUS_MAP: Record<string, number> = {
  PENDING: VIRTUAL_ACCOUNT_STATUS_PENDING,
  CREATED: VIRTUAL_ACCOUNT_STATUS_CREATED,
  FAILED: VIRTUAL_ACCOUNT_STATUS_FAILED,
};

// beneficiary_account_status_map() - human key -> numeric status.
export const BENEFICIARY_ACCOUNT_STATUS_MAP: Record<string, number> = {
  PENDING: BENEFICIARY_ACCOUNT_PENDING,
  ACTIVATED: BENEFICIARY_ACCOUNT_ACTIVATED,
  DEACTIVATED: BENEFICIARY_ACCOUNT_DEACTIVATED,
  BLOCKED: BENEFICIARY_ACCOUNT_BLOCKED,
};

// onboarding_status_label()
export function onboardingStatusLabel(value: number): string {
  switch (value) {
    case ONBOARDING_STATUS_PENDING:
      return "PENDING";
    case ONBOARDING_STATUS_INITIATED:
      return "INITIATED";
    case ONBOARDING_STATUS_CREATED:
      return "CREATED";
    case ONBOARDING_STATUS_FAILED:
      return "FAILED";
    default:
      return "PENDING";
  }
}

export function virtualAccountStatusLabel(value: number): string {
  switch (value) {
    case VIRTUAL_ACCOUNT_STATUS_PENDING:
      return "PENDING";
    case VIRTUAL_ACCOUNT_STATUS_CREATED:
      return "CREATED";
    case VIRTUAL_ACCOUNT_STATUS_FAILED:
      return "FAILED";
    default:
      return "PENDING";
  }
}

// Quote status (mirror of QUOTE_*)
export const QUOTE_NOT_SUBMITTED = 0;
export const QUOTE_SUBMITTED = 1;
export const QUOTE_EXPIRED = 2;
export const QUOTE_TYPE_FORWARD = "FORWARD";
export const QUOTE_TYPE_REVERSE = "REVERSE";
export const QUOTE_MODE_RATE = "rate";
export const QUOTE_MODE_QUOTATION = "quote";

// Wallet transaction
export const WALLET_TRANSACTION_PENDING = 0;
export const WALLET_TRANSACTION_COMPLETED = 1;
export const WALLET_TRANSACTION_FAILED = 2;
export const WALLET_TRANSACTION_REJECTED = 3;
export const WALLET_TRANSACTION_CANCELLED = 4;

export const WALLET_STATUS_ACTIVE = 1;
export const WALLET_STATUS_INACTIVE = 0;

export const WALLET_STATUS_MAP: Record<string, number> = {
  ACTIVE: WALLET_STATUS_ACTIVE,
  INACTIVE: WALLET_STATUS_INACTIVE,
};

export function walletStatusLabel(value: number): string {
  return value === WALLET_STATUS_ACTIVE ? "ACTIVE" : "INACTIVE";
}

export function walletTransactionStatusLabel(value: number): string {
  switch (value) {
    case WALLET_TRANSACTION_COMPLETED:
      return "COMPLETED";
    case WALLET_TRANSACTION_FAILED:
    case WALLET_TRANSACTION_REJECTED:
    case WALLET_TRANSACTION_CANCELLED:
      return "FAILED";
    case WALLET_TRANSACTION_PENDING:
    default:
      return "PENDING";
  }
}

// Sender status
export const SENDER_STATUS_PENDING = 0;
export const SENDER_STATUS_APPROVED = 1;
export const SENDER_STATUS_REJECTED = 2;

export const PAID_TO_BENEFICIARY = 1;
export const PAID_TO_WALLET = 2;
export const SENDER_STATUS_EXPIRED = 3;
export const SENDER_STATUS_DISABLED = 4;

export const REMITTER_STATUS_MAP: Record<string, number> = {
  PENDING: SENDER_STATUS_PENDING,
  APPROVED: SENDER_STATUS_APPROVED,
  REJECTED: SENDER_STATUS_REJECTED,
  EXPIRED: SENDER_STATUS_EXPIRED,
  DISABLED: SENDER_STATUS_DISABLED,
};

// Transaction type (debit/credit) - shared across wallet, ledger, etc.
export const TRANSACTION_TYPE_DEBIT = 1;
export const TRANSACTION_TYPE_CREDIT = 2;

// Fee shape (FEE_TYPE_*)
export const FEE_TYPE_FLAT = 1;
export const FEE_TYPE_PERCENTAGE = 2;
export const FEE_TYPE_FIXED = 3;

export const TRANSACTION_FEE = "transaction_fee";
export const FX_FEE = "fx_fee";
export const MAINTENANCE_FEE = "maintenance_fee";
export const DEPOSIT_FEE = "deposit_fee";

// Polymorphic morph map keys (mirror Laravel's class -> table-name maps).
// Used by Quote.source_type and Ledger.transaction_type, etc.
export const MORPH_VIRTUAL_ACCOUNT = "App\\Models\\VirtualAccount";
export const MORPH_WALLET = "App\\Models\\Wallet";
export const MORPH_USER = "App\\Models\\User";
export const MORPH_MERCHANT = "App\\Models\\Merchant";
export const MORPH_BENEFICIARY_TRANSACTION = "App\\Models\\BeneficiaryTransaction";
export const MORPH_DEPOSIT_TRANSACTION = "App\\Models\\DepositTransaction";
export const MORPH_WALLET_TRANSACTION = "App\\Models\\WalletTransaction";

// Deposits (Phase 5)
export const DEPOSIT_TRANSACTION_PENDING = 0;
export const DEPOSIT_TRANSACTION_COMPLETED = 1;
export const DEPOSIT_TRANSACTION_FAILED = 2;
export const DEPOSIT_TRANSACTION_REJECTED = 3;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED = 4;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING = 5;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED = 6;

export const DEPOSIT_TRANSACTION_STATUS_MAP: Record<string, number> = {
  PROCESSING: DEPOSIT_TRANSACTION_PENDING,
  COMPLETED: DEPOSIT_TRANSACTION_COMPLETED,
  FAILED: DEPOSIT_TRANSACTION_FAILED,
};

export function depositTransactionStatusLabel(value: number): string {
  switch (value) {
    case DEPOSIT_TRANSACTION_PENDING:
    case DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED:
    case DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING:
    case DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED:
      return "PROCESSING";
    case DEPOSIT_TRANSACTION_COMPLETED:
      return "COMPLETED";
    case DEPOSIT_TRANSACTION_FAILED:
    case DEPOSIT_TRANSACTION_REJECTED:
      return "FAILED";
    default:
      return "PROCESSING";
  }
}

export const DEPOSIT_TYPE_DEPOSIT = "deposit";
export const DEPOSIT_TYPE_REFUND = "refund";
export const DEPOSIT_TYPE_TOPUP = "topup";
export const DEPOSIT_TYPE_CREDIT = "credit";

export const DEPOSIT_TYPE_MAP: Record<string, string> = {
  CREDIT: DEPOSIT_TYPE_CREDIT,
  TOPUP: DEPOSIT_TYPE_TOPUP,
};

export const DEPOSIT_CURRENCY_TYPES = ["USDC", "USDT", "USD"] as const;

// Transaction-type map (CREDIT/DEBIT) - mirror of transaction_type_map().
export const TRANSACTION_TYPE_MAP: Record<string, number> = {
  CREDIT: TRANSACTION_TYPE_CREDIT,
  DEBIT: TRANSACTION_TYPE_DEBIT,
};

// Export type
export const FILE_TYPE_PDF = 1;
export const FILE_TYPE_EXCEL = 2;
export const EXPORT_TYPE_PDF = "pdf";
export const EXPORT_TYPE_EXCEL = "excel";

// Phase 6 - BeneficiaryTransaction full status set + maps
export const BENEFICIARY_TRANSACTION_EXPIRED = 6;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED = 12;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD = 13;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED = 14;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING = 15;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED = 16;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED = 17;

export const BENEFICIARY_TRANSACTION_STATUS_MAP: Record<string, number> = {
  WAITING_FOR_APPROVAL: BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
  APPROVED: BENEFICIARY_TRANSACTION_APPROVED,
  INITIATED: BENEFICIARY_TRANSACTION_INITIATED,
  PROCESSING: BENEFICIARY_TRANSACTION_PROCESSING,
  COMPLETED: BENEFICIARY_TRANSACTION_COMPLETED,
  FAILED: BENEFICIARY_TRANSACTION_FAILED,
  EXPIRED: BENEFICIARY_TRANSACTION_EXPIRED,
  REJECTED: BENEFICIARY_TRANSACTION_REJECTED,
  CANCELLED: BENEFICIARY_TRANSACTION_CANCELLED,
  CORPORATE_INITIATED: BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
};

export function beneficiaryTransactionStatusLabel(value: number, _isTeam = false): string {
  switch (value) {
    case BENEFICIARY_TRANSACTION_COMPLETED:
      return "COMPLETED";

    case BENEFICIARY_TRANSACTION_FAILED:
    case BENEFICIARY_TRANSACTION_EXPIRED:
    case BENEFICIARY_TRANSACTION_REJECTED:
    case BENEFICIARY_TRANSACTION_CANCELLED:
      return "FAILED";

    case BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL:
      return "WAITING_FOR_APPROVAL";

    case BENEFICIARY_TRANSACTION_APPROVED:
    case BENEFICIARY_TRANSACTION_INITIATED:
    case BENEFICIARY_TRANSACTION_PROCESSING:
    case BENEFICIARY_TRANSACTION_CORPORATE_INITIATED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING:
    case BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED:
    case BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED:
    default:
      return "PROCESSING";
  }
}

// Approval-status map - subset of statuses a user/team-member can apply via
// /update-status. Mirror of beneficiary_transaction_approval().
export const BENEFICIARY_TRANSACTION_APPROVAL_MAP: Record<string, number> = {
  APPROVED: BENEFICIARY_TRANSACTION_APPROVED,
  REJECTED: BENEFICIARY_TRANSACTION_REJECTED,
};

// Team-member roles + permissions (referenced from create()).
export const TEAM_MEMBER_ROLE_SUPPORT_MEMBER = 3;
export const TEAM_MEMBER_PERMISSION_INITIATOR = 1;
export const TEAM_MEMBER_PERMISSION_MAKER = 2;
export const TEAM_MEMBER_PERMISSION_CHECKER = 3;
export const TEAM_MEMBER_PERMISSION_MAKER_CHECKER = 4;

// Payment proof
export const PAYMENT_PROOF_REQUESTED = 1;
export const PAYMENT_PROOF_UPLOADED = 2;
export const PAYMENT_PROOF_REJECTED = 3;
export const PAYMENT_PROOF_SWIFT = "swift_copy";
export const PAYMENT_PROOF_FIRA = "fira";

// Payout-job status (already had pending/processing/completed/failed)
export const PAYOUT_JOB_STATUS_REJECTED = 4;

// Team-member roles (mirror of user_role_map).
export const TEAM_MEMBER_ROLE_ADMIN = 1;
export const TEAM_MEMBER_ROLE_OWNER = 2;
// (TEAM_MEMBER_ROLE_SUPPORT_MEMBER, TEAM_MEMBER_ROLE_CORPORATE already defined.)

export const USER_ROLE_MAP: Record<string, number> = {
  ADMIN: TEAM_MEMBER_ROLE_ADMIN,
  OWNER: TEAM_MEMBER_ROLE_OWNER,
  TEAM_MEMBER: TEAM_MEMBER_ROLE_SUPPORT_MEMBER,
  CORPORATE: TEAM_MEMBER_ROLE_CORPORATE,
};

export const USER_PERMISSION_MAP: Record<string, number> = {
  APPROVER: TEAM_MEMBER_PERMISSION_CHECKER,
  INITIATOR: TEAM_MEMBER_PERMISSION_INITIATOR,
  CREATOR: TEAM_MEMBER_PERMISSION_MAKER,
  CREATOR_AND_APPROVER: TEAM_MEMBER_PERMISSION_MAKER_CHECKER,
};

// Team-member status (already had ACTIVE = 1, INACTIVE = 0).
export const TEAM_MEMBER_ACTIVE = 1;
export const TEAM_MEMBER_INACTIVE = 0;
export const TEAM_MEMBER_DISABLED = 2;

export const TEAM_MEMBER_STATUS_MAP: Record<string, number> = {
  ACTIVE: TEAM_MEMBER_ACTIVE,
  INACTIVE: TEAM_MEMBER_INACTIVE,
  DISABLED: TEAM_MEMBER_DISABLED,
};

// Sanctum-style tokenable types.
export const TOKENABLE_USER = "App\\Models\\User";
export const TOKENABLE_TEAM_MEMBER = "App\\Models\\TeamMember";

// KYC service tags (mirror Laravel ID_VERIFIED_BY_*).
export const ID_VERIFIED_BY_HERALD_SUMSUB = "hs";
export const ID_VERIFIED_BY_SUREPASS = "sp";
export const ID_VERIFIED_BY_INCODE = "ic";

// Callback event names emitted to merchant white-label endpoints
// (mirror of Laravel CALLBACK_* defines). Phase 9.
export const CALLBACK_PAYOUT_SUCCESS = "PAYOUT_SUCCESS";
export const CALLBACK_PAYOUT_REJECTED = "PAYOUT_REJECTED";
export const CALLBACK_PAYOUT_FAILED = "PAYOUT_FAILED";
export const CALLBACK_DEPOSIT_SUCCESS = "DEPOSIT_SUCCESS";
export const CALLBACK_DEPOSIT_FAILED = "DEPOSIT_FAILED";
export const CALLBACK_VIRTUAL_ACCOUNT_CREATED = "VIRTUAL_ACCOUNT_CREATED";
export const CALLBACK_RESPONSE = "callback";

// External-service-call audit `call_for` value for inbound webhooks. Phase 9.
export const EXTERNAL_CALL_FOR_CALLBACK = "callback";

// `call_for` audit values used by the Reports microservice + Remittance.
export const EXTERNAL_CALL_FOR_DEBIT = "debit";
export const EXTERNAL_CALL_FOR_DEPOSIT_REPORT = "deposit_report";
export const EXTERNAL_CALL_FOR_REMITTANCE = "remittance";

// Loggable polymorphic morph types for callback_logs
// (mirrors Laravel BeneficiaryTransaction::loggable() polymorphic).
export const MORPH_BENEFICIARY_TRANSACTION_CALLBACK_LOG = "App\\Models\\BeneficiaryTransaction";
