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
