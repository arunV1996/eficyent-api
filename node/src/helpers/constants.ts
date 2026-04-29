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

export const METHOD_REGISTER = "register";
export const METHOD_LOGIN = "login";

export const MERCHANT_TYPE_PAYOUT = 1;
export const MERCHANT_TYPE_WHITELABEL = 2;
export const MERCHANT_TYPE_PAYOUTINTEGRATOR = 3;
export const MERCHANT_TYPE_PAYINCOLLECTION = 4;

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
export const EXTERNAL_TYPE_HERALD_REMITTANCE = "hr";

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

// Sender status
export const SENDER_STATUS_PENDING = 0;
export const SENDER_STATUS_APPROVED = 1;
export const SENDER_STATUS_REJECTED = 2;
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
