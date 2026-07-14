// User account types (mirrors USER_TYPE_* in node/src/helpers/constants.ts)
export const USER_TYPE_PENDING = 0;
export const USER_TYPE_PERSONAL = 1;
export const USER_TYPE_BUSINESS = 2;

// merchant_settings.supported_user_types values
export const SUPPORTED_USER_INDIVIDUAL = "individual";
export const SUPPORTED_USER_BUSINESS = "business";

export const USER_TYPES = [USER_TYPE_PERSONAL, USER_TYPE_BUSINESS] as const;

// User roles
export const USER_ROLE_USER = 1;
export const USER_ROLE_ADMIN = 2;
export const USER_ROLE_TEAM_MEMBER = 3;

// Personal access token abilities (Sanctum-style ability scopes)
export const TOKEN_ABILITY_AUTHENTICATION = "authentication";
export const TOKEN_ABILITY_TWO_FACTOR_PENDING = "two-factor-pending";

// Polymorphic tokenable_type value on personal_access_tokens.
// Kept as the Laravel model FQCN so tokens issued by the legacy service
// and the restructured service are interchangeable.
export const TOKENABLE_TYPE_USER = "App\\Models\\User";

// Generic active/inactive flags used across several tables (mirrors the
// current node/src/helpers/constants.ts ACTIVE/INACTIVE pair).
export const ACTIVE = 1;
export const INACTIVE = 0;

// Payment-type classification labels (sender x recipient business flags)
export const B2B = "B2B";
export const B2C = "B2C";
export const C2B = "C2B";
export const C2C = "C2C";

// Deposit lookup query types (mirror of LOOKUP_TYPE_* in legacy constants)
export const LOOKUP_TYPE_SOURCE_OF_FUNDS = "source_of_funds";
export const LOOKUP_TYPE_PURPOSE_OF_TRANSACTION = "purpose_of_transaction";

// Lookup table `type` groups (mirror of legacy constants)
export const LOOKUP_TYPE_ID_TYPE = "id_types";
export const LOOKUP_TYPE_BUSINESS_TYPES = "business_types";
export const LOOKUP_TYPE_PROFESSIONS = "professions";
export const LOOKUP_TYPE_SOURCES_OF_INCOMES = "sources_of_incomes";
export const LOOKUP_TYPE_BUSINESS_VERIFICATION_TYPES =
    "business_verification_types";
export const LOOKUP_TYPE_ADDRESS_TYPES = "address_types";
export const LOOKUP_TYPE_PROOF_OF_ADDRESS = "proof_of_address";
export const LOOKUP_TYPE_PURPOSES_OF_TRANSACTIONS =
    "purposes_of_transactions";
export const LOOKUP_TYPE_EEC_PAYMENT_PURPOSE = "eec_payment_purpose";
export const LOOKUP_TYPE_DOCUMENT_TYPES = "document_types";
export const LOOKUP_TYPE_COUNTRY_CONFIGURATIONS = "country_configurations";

// Onboarding steps (mirror of legacy constants)
export const ONBOARDING_STEP_ONE = 1;
export const ONBOARDING_STEP_TWO = 2;
export const ONBOARDING_STEP_THREE = 3;
export const ONBOARDING_STEP_TWO_COMPLETED = 2;
export const ONBOARDING_STEP_THREE_COMPLETED = 3;

// get-form-fields `type` query value -> numeric step
export const ONBOARDING_STEP_MAP: Record<string, number> = {
    REGISTER_USER: ONBOARDING_STEP_ONE,
    GET_INFORMATION: ONBOARDING_STEP_TWO_COMPLETED,
    GET_DOCUMENTS: ONBOARDING_STEP_THREE_COMPLETED,
};

// Identity verification statuses / providers (subset needed so far)
export const IDENTITY_VERIFICATION_PENDING = 1;
export const IDENTITY_VERIFICATION_COMPLETED = 5;
export const ID_VERIFIED_BY_ADMIN = "ad";

// Onboarding completion gate (mirror of ONBOARDING_STEP_FOUR_COMPLETED)
export const ONBOARDING_STEP_FOUR_COMPLETED = 4;

// Default page size for list endpoints
export const TAKE_COUNT = 12;

// Payment rails
export const PAYMENT_RAIL_WIRE = "wire";
export const PAYMENT_RAIL_SWIFT = "swift";
export const PAYMENT_RAIL_ACH = "ach";

// Beneficiary account statuses + human-key map (mirror of
// beneficiary_account_status_map())
export const BENEFICIARY_ACCOUNT_PENDING = 0;
export const BENEFICIARY_ACCOUNT_ACTIVATED = 1;
export const BENEFICIARY_ACCOUNT_DEACTIVATED = 2;
export const BENEFICIARY_ACCOUNT_BLOCKED = 3;

export const BENEFICIARY_ACCOUNT_STATUS_MAP: Record<string, number> = {
    PENDING: BENEFICIARY_ACCOUNT_PENDING,
    ACTIVATED: BENEFICIARY_ACCOUNT_ACTIVATED,
    DEACTIVATED: BENEFICIARY_ACCOUNT_DEACTIVATED,
    BLOCKED: BENEFICIARY_ACCOUNT_BLOCKED,
};

// Default business model when a merchant has no business_model setting
export const BUSINESS_MODEL_MTO = "mto";

// Merchant types (subset needed so far; mirror of legacy constants)
export const MERCHANT_TYPE_PAYOUT = 1;
export const MERCHANT_TYPE_PAYOUTINTEGRATOR = 3;
export const MERCHANT_TYPE_PAYINCOLLECTION = 4;

// Provider external types (subset needed so far)
export const EXTERNAL_TYPE_CALIZA = "ec";
export const EXTERNAL_TYPE_DIGININE = "ed";
export const EXTERNAL_TYPE_USI = "EUSI";
export const EXTERNAL_TYPE_IME = "EIME";
export const EXTERNAL_TYPE_MOBI = "EMB";
export const EXTERNAL_TYPE_PROCESSING_UNIT = "pu";

// Polymorphic morph classes (kept as Laravel FQCNs so audit rows are
// interchangeable between the legacy and restructured services)
export const MORPH_BENEFICIARY_TRANSACTION = "App\\Models\\BeneficiaryTransaction";
export const MORPH_DEPOSIT_TRANSACTION = "App\\Models\\DepositTransaction";
export const MORPH_VIRTUAL_ACCOUNT = "App\\Models\\VirtualAccount";
export const MORPH_WALLET = "App\\Models\\Wallet";

// Quotes
export const QUOTE_TYPE_FORWARD = "FORWARD";
export const QUOTE_TYPE_REVERSE = "REVERSE";
export const QUOTE_MODE_QUOTATION = "quote";
export const QUOTE_MODE_RATE = "rate";
export const QUOTE_SUBMITTED = 1;
export const EXTERNAL_TYPE_MASSIVE = "em";

// Wallets
export const WALLET_STATUS_ACTIVE = 1;
export const WALLET_STATUS_INACTIVE = 0;

export const WALLET_STATUS_MAP: Record<string, number> = {
    ACTIVE: WALLET_STATUS_ACTIVE,
    INACTIVE: WALLET_STATUS_INACTIVE,
};

// Wallet transaction statuses (mirror of legacy constants;
// WALLET_TRANSACTION_COMPLETED lives in the transactions substrate below)
export const WALLET_TRANSACTION_PENDING = 0;
export const WALLET_TRANSACTION_FAILED = 2;
export const WALLET_TRANSACTION_REJECTED = 3;
export const WALLET_TRANSACTION_CANCELLED = 4;

// Virtual account statuses (mirror of legacy constants)
export const VIRTUAL_ACCOUNT_STATUS_PENDING = 0;
export const VIRTUAL_ACCOUNT_STATUS_CREATED = 1;
export const VIRTUAL_ACCOUNT_STATUS_FAILED = 2;

// Deposit transaction statuses (mirror of legacy constants;
// DEPOSIT_TRANSACTION_COMPLETED lives in the transactions substrate below)
export const DEPOSIT_TRANSACTION_PENDING = 0;
export const DEPOSIT_TRANSACTION_FAILED = 2;
export const DEPOSIT_TRANSACTION_REJECTED = 3;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_INITIATED = 4;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_PROCESSING = 5;
export const DEPOSIT_TRANSACTION_PROCESSING_UNIT_FAILED = 6;

// Deposit types (DEPOSIT_TYPE_REFUND lives in the refund substrate below)
export const DEPOSIT_TYPE_DEPOSIT = "deposit";
export const DEPOSIT_TYPE_TOPUP = "topup";
export const DEPOSIT_TYPE_CREDIT = "credit";

// Client-facing deposit type tokens accepted by /deposits/store
// (mirror of DEPOSIT_TYPE_MAP)
export const DEPOSIT_TYPE_MAP: Record<string, string> = {
    CREDIT: DEPOSIT_TYPE_CREDIT,
    TOPUP: DEPOSIT_TYPE_TOPUP,
};

// Business models
export const BUSINESS_MODEL_DEAL_BASED = "DEAL_BASED";

// Fee / commission configuration (mirror of legacy constants)
export const MERCHANT_TYPE_WHITELABEL = 2;
export const FEE_TYPE_FLAT = 1;
export const FEE_TYPE_PERCENTAGE = 2;
export const FEE_TYPE_FIXED = 3;
export const TRANSACTION_FEE = "transaction_fee";
export const FX_FEE = "fx_fee";
export const DEPOSIT_FEE = "deposit_fee";
export const MORPH_USER = "App\\Models\\User";
export const MORPH_MERCHANT = "App\\Models\\Merchant";

// Transactions substrate (mirror of legacy constants)
export const TRANSACTION_TYPE_DEBIT = 1;

// Ledger paid_to markers (mirror of legacy constants)
export const PAID_TO_BENEFICIARY = 1;
export const PAID_TO_WALLET = 2;

// Client-facing CREDIT/DEBIT tokens (mirror of transaction_type_map())
export const TRANSACTION_TYPE_MAP: Record<string, number> = {
    CREDIT: 2,
    DEBIT: 1,
};
export const TRANSACTION_TYPE_CREDIT = 2;
export const WALLET_TRANSACTION_COMPLETED = 1;
export const DEPOSIT_TRANSACTION_COMPLETED = 1;
export const TEAM_MEMBER_ROLE_CORPORATE = 4;
export const TEAM_MEMBER_ROLE_SUPPORT_MEMBER = 3;
export const PAYOUT_JOB_STATUS_PENDING = 0;
export const PAYOUT_JOB_STATUS_PROCESSING = 1;
export const PAYOUT_JOB_STATUS_COMPLETED = 2;
export const PAYOUT_JOB_STATUS_FAILED = 3;

// Beneficiary transaction statuses (mirror of legacy constants)
export const BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL = 0;
export const BENEFICIARY_TRANSACTION_APPROVED = 1;
export const BENEFICIARY_TRANSACTION_INITIATED = 2;
export const BENEFICIARY_TRANSACTION_PROCESSING = 3;
export const BENEFICIARY_TRANSACTION_COMPLETED = 4;
export const BENEFICIARY_TRANSACTION_FAILED = 5;
export const BENEFICIARY_TRANSACTION_EXPIRED = 6;
export const BENEFICIARY_TRANSACTION_REJECTED = 7;
export const BENEFICIARY_TRANSACTION_CANCELLED = 8;
export const BENEFICIARY_TRANSACTION_CORPORATE_INITIATED = 9;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATED = 10;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_APPROVED = 11;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED = 12;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_HOLD = 13;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATED = 14;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_PROCESSING = 15;
export const BENEFICIARY_TRANSACTION_PROCESSING_UNIT_INITIATION_FAILED = 16;
export const BENEFICIARY_TRANSACTION_COMPLIANCE_INITIATION_FAILED = 17;

// Filter tokens accepted by /beneficiary-transactions/list?status=...
// (mirror of BENEFICIARY_TRANSACTION_STATUS_MAP)
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

// Approval-status subset a user/team-member can apply via /update-status
// (mirror of beneficiary_transaction_approval())
export const BENEFICIARY_TRANSACTION_APPROVAL_MAP: Record<string, number> = {
    APPROVED: BENEFICIARY_TRANSACTION_APPROVED,
    REJECTED: BENEFICIARY_TRANSACTION_REJECTED,
};

// Team-member permissions (mirror of legacy constants)
export const TEAM_MEMBER_PERMISSION_INITIATOR = 1;
export const TEAM_MEMBER_PERMISSION_MAKER = 2;
export const TEAM_MEMBER_PERMISSION_CHECKER = 3;
export const TEAM_MEMBER_PERMISSION_MAKER_CHECKER = 4;
export const TEAM_MEMBER_PERMISSION_VIEWER = 5;

// Payment-proof lifecycle (mirror of legacy constants)
export const PAYMENT_PROOF_REQUESTED = 1;
export const PAYMENT_PROOF_UPLOADED = 2;
export const PAYMENT_PROOF_REJECTED = 3;
export const PAYMENT_PROOF_SWIFT = "swift_copy";
export const PAYMENT_PROOF_FIRA = "fira";

// Deposit refund substrate (mirror of legacy constants)
export const DEPOSIT_TYPE_REFUND = "refund";
export const MORPH_WALLET_TRANSACTION = "App\\Models\\WalletTransaction";

// Merchant callback event names (mirror of Laravel CALLBACK_* defines)
export const CALLBACK_PAYOUT_SUCCESS = "TRANSACTION_COMPLETED";
export const CALLBACK_PAYOUT_REJECTED = "TRANSACTION_REJECTED";
export const CALLBACK_PAYOUT_FAILED = "TRANSACTION_FAILED";
export const CALLBACK_DEPOSIT_SUCCESS = "DEPOSIT_COMPLETED";
export const CALLBACK_DEPOSIT_FAILED = "DEPOSIT_REJECTED";

// Senders
export const SENDER_STATUS_DISABLED = 4;

// Receiving-country recipient_type translation (mirror of user_type_map())
export const USER_TYPE_MAP: Record<string, number> = {
    PERSONAL: USER_TYPE_PERSONAL,
    BUSINESS: USER_TYPE_BUSINESS,
};

// Same regex as Laravel passwordRegex()
export const PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._\-])[A-Za-z\d@$!%*?&._\-]{8,}$/;

// Mirror of disposable_email_list()
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
    "mailinator.com",
    "tempmail.com",
    "10minutemail.com",
    "guerrillamail.com",
    "maildrop.cc",
    "dropmail.me",
    "harakirimail.com",
    "trashmail.com",
    "yopmail.com",
    "fakeinbox.com",
    "throwawaymail.com",
    "getnada.com",
    "tempinbox.com",
    "tempmailo.com",
    "moakt.com",
    "mailnesia.com",
    "spamgourmet.com",
    "sharklasers.com",
]);

// Mirror of get_payment_rails()
export const PAYMENT_RAILS: { label: string; value: string }[] = [
    { label: "Wire", value: "wire" },
    { label: "ACH", value: "ach" },
    { label: "Swift", value: "swift" },
];

// Mirror of get_account_types()
export const ACCOUNT_TYPES: { label: string; value: string }[] = [
    { label: "Checking", value: "Checking" },
    { label: "Savings", value: "Savings" },
    { label: "General Ledger", value: "GeneralLedger" },
    { label: "Loan", value: "Loan" },
];

// Mirror of deposit_source_of_fund() — used by /user/lookups/deposit_lookups
export const DEPOSIT_SOURCE_OF_FUNDS: Record<string, string> = {
    employment_income: "Employment Income",
    personal_savings: "Personal Savings",
    business_revenue: "Business Revenue",
    sales_commission: "Sales Commission",
    borrowed_funds: "Borrowed Funds",
    investment_returns: "Investment Returns",
    legal_settlement: "Legal Settlement Proceeds",
    prize_earnings: "Prize or Lottery Earnings",
    goods_sales: "Merchandise Sales",
    property_sale: "Property Disposal",
    dividend_income: "Dividend Earnings",
    pension_income: "Retirement Pension",
    freelance_income: "Freelance Earnings",
    gift_received: "Family Support / Gift",
    other_income: "Other Income Source",
};

// Mirror of deposit_purpose()
export const DEPOSIT_PURPOSE: Record<string, string> = {
    incentive_payment: "Incentive Payment",
    internal_transfer: "Internal Fund Transfer",
    card_settlement: "Card Settlement Processing",
    credit_card_bill: "Credit Card Bill Payment",
    trade_settlement: "Commercial Trade Settlement",
    consulting_services: "Technology or Consulting Services",
    license_fee: "Intellectual Property / License Fee",
    trade_refund: "Trade Refund or Adjustment",
    tax_payment: "Government Tax Payment",
    invoice_payment: "Invoice Settlement",
    loan_repayment: "Debt Repayment",
    payroll_payment: "Payroll Disbursement",
    supplier_payment: "Vendor or Supplier Payment",
    investment_funding: "Investment Funding",
    personal_transfer: "Personal Fund Transfer",
    product_purchase: "Purchase of Products",
    service_payment: "Professional Service Charges",
    other_payment: "Miscellaneous Payment",
};

// Alpha-3 -> alpha-2 country code map used for flag asset resolution
// (mirror of the map in node/src/helpers/lookups.ts)
export const ALPHA3_TO_ALPHA2: Record<string, string> = {
    "ALB": "al", "DZA": "dz", "AND": "ad", "AGO": "ao", "ATA": "aq", "ARG": "ar", "ARM": "am", "ABW": "aw",
    "AUS": "au", "AUT": "at", "AZE": "az", "BHR": "bh", "BGD": "bd", "BEL": "be", "BLZ": "bz", "BEN": "bj",
    "BTN": "bt", "BOL": "bo", "BIH": "ba", "BWA": "bw", "BRA": "br", "BRN": "bn", "BGR": "bg", "BFA": "bf",
    "MMR": "mm", "BDI": "bi", "KHM": "kh", "CMR": "cm", "CAN": "ca", "CPV": "cv", "TCD": "td", "CHL": "cl",
    "CXR": "cx", "CCK": "cc", "COL": "co", "COM": "km", "COG": "cd", "COK": "ck", "CRI": "cr", "CIV": "ci",
    "HRV": "hr", "CYP": "cy", "CZE": "cz", "DNK": "dk", "DJI": "dj", "ECU": "ec", "EGY": "eg", "SLV": "sv",
    "GNQ": "gq", "ERI": "er", "EST": "ee", "FLK": "fk", "FRO": "fo", "FJI": "fj", "FIN": "fi", "FRA": "fr",
    "PYF": "pf", "GAB": "ga", "GMB": "gm", "GEO": "ge", "DEU": "de", "GHA": "gh", "GIB": "gi", "GRC": "gr",
    "GRL": "gl", "GTM": "gt", "GIN": "gn", "GNB": "gw", "GUY": "gy", "HTI": "ht", "VAT": "va", "HND": "hn",
    "HKG": "hk", "HUN": "hu", "ISL": "is", "IND": "in", "IDN": "id", "IRL": "ie", "ISR": "il", "ITA": "it",
    "JPN": "jp", "JOR": "jo", "KAZ": "kz", "KEN": "ke", "KIR": "ki", "KOR": "kr", "XKX": "un", "KWT": "kw",
    "KGZ": "kg", "LAO": "la", "LVA": "lv", "LBN": "lb", "LSO": "ls", "LBR": "lr", "LIE": "li", "LTU": "lt",
    "LUX": "lu", "MAC": "mo", "MKD": "mk", "MDG": "mg", "MWI": "mw", "MYS": "my", "MDV": "mv", "MLT": "mt",
    "MHL": "mh", "MRT": "mr", "MUS": "mu", "MYT": "yt", "MEX": "mx", "FSM": "fm", "MDA": "md", "MCO": "mc",
    "MNG": "mn", "MNE": "me", "MAR": "ma", "MOZ": "mz", "NAM": "na", "NRU": "nr", "NPL": "np", "NLD": "nl",
    "ANT": "an", "NCL": "nc", "NZL": "nz", "NER": "ne", "NGA": "ng", "NIU": "nu", "NOR": "no", "OMN": "om",
    "PAK": "pk", "PLW": "pw", "PSE": "ps", "PAN": "pa", "PNG": "pg", "PRY": "py", "PER": "pe", "PHL": "ph",
    "PCN": "pn", "POL": "pl", "PRT": "pt", "QAT": "qa", "REU": "re", "ROU": "ro", "RUS": "ru", "RWA": "rw",
    "BLM": "bl", "MAF": "mf", "WSM": "ws", "SMR": "sm", "STP": "st", "SAU": "sa", "SEN": "sn", "SRB": "rs",
    "SYC": "sc", "SLE": "sl", "SGP": "sg", "SVK": "sk", "SVN": "si", "SLB": "sb", "ZAF": "za", "ESP": "es",
    "LKA": "lk", "SHN": "sh", "SUR": "sr", "SJM": "sj", "SWZ": "sz", "SWE": "se", "CHE": "ch", "TWN": "tw",
    "TJK": "tj", "TZA": "tz", "THA": "th", "TLS": "tl", "TGO": "tg", "TKL": "tk", "TON": "to", "TUN": "tn",
    "TUR": "tr", "TKM": "tm", "TUV": "tv", "UGA": "ug", "UKR": "ua", "ARE": "ae", "GBR": "gb", "USA": "us",
    "URY": "uy", "UZB": "uz", "VUT": "vu", "VEN": "yv", "VNM": "vn", "WLF": "wf", "ESH": "eh", "YEM": "ye",
    "ZMB": "zm", "ZWE": "zw", "CHN": "cn",
};
