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
