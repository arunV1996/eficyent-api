import {
    authSanctum,
    businessUserAccess,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
} from "../middleware/auth";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { appSignatureIfEnforced } from "../middleware/appSignature";
import {
    authTeam,
    checkerAccess,
    makerAccess,
    ownerAccess,
    teamPasswordResetGate,
} from "../middleware/team_auth";
import { fvbankWebhookSignature } from "../middleware/fvbank_webhook_signature";
import { idempotency } from "../middleware/idempotency";
import { strictBody } from "../middleware/strictBody";
import { validateMerchant } from "../middleware/validateMerchant";
import {
    DIRECT_ALLOWED_KEYS,
    INSTANT_ALLOWED_KEYS,
    instantPayoutBodyValidator,
    payoutFormFieldsQueryValidator,
    PROOF_REQUEST_ALLOWED_KEYS,
    proofGetQueryValidator,
    proofRequestBodyValidator,
    retryJobParamValidator,
    retryTrxnParamValidator,
    sendMoneyDirectBodyValidator,
    TRANSACTION_CANCEL_ALLOWED_KEYS,
    TRANSACTION_STORE_ALLOWED_KEYS,
    TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS,
    transactionCancelBodyValidator,
    transactionExportMultipleQueryValidator,
    transactionListQueryValidator,
    transactionShowQueryValidator,
    transactionStoreBodyValidator,
    transactionUpdateStatusBodyValidator,
} from "../validators/beneficiary_transaction.validator";
import {
    DEPOSIT_STORE_ALLOWED_KEYS,
    depositListQueryValidator,
    depositQuoteQueryValidator,
    depositShowQueryValidator,
    depositStoreBodyValidator,
} from "../validators/deposit.validator";
import {
    WALLET_CONVERT_ALLOWED_KEYS,
    walletConvertBodyValidator,
    walletListQueryValidator,
    walletShowQueryValidator,
    walletTransactionShowQueryValidator,
    walletTransactionsQueryValidator,
} from "../validators/wallet.validator";
import {
    beneficiaryFormFieldsQueryValidator,
    beneficiaryListQueryValidator,
    beneficiaryShowQueryValidator,
    validateAccountBodyValidator,
} from "../validators/beneficiary_account.validator";
import {
    banksQueryValidator,
    receivingCountriesQueryValidator,
} from "../validators/lookup.validator";
import { getFormFieldsQueryValidator } from "../validators/onboarding.validator";
import {
    quoteStoreCrossFieldRules,
    quoteStoreValidator,
    refreshRatesBodyValidator,
} from "../validators/quote.validator";
import {
    emailOnlyValidator,
    loginValidator,
    REGISTER_ALLOWED_KEYS,
    registerValidator,
    resetPasswordValidator,
    tfaLoginValidator,
    verifyCodeValidator,
    verifyOtpValidator,
} from "../validators/auth.validator";
import {
    dashboardChartsDataQueryValidator,
    dashboardStatisticsQueryValidator,
} from "../validators/dashboard.validator";
import {
    ledgerListQueryValidator,
    ledgerShowQueryValidator,
} from "../validators/ledger.validator";
import {
    depositLookupsQueryValidator,
    statesQueryValidator,
} from "../validators/lookup.validator";
import {
    senderFormFieldsQueryValidator,
    senderListQueryValidator,
    senderShowQueryValidator,
    senderUpdateBodyValidator,
} from "../validators/sender.validator";
import { statementExportQueryValidator } from "../validators/statement.validator";
import { staticPageShowQueryValidator } from "../validators/static_page.validator";
import {
    ACCEPT_INVITE_ALLOWED_KEYS,
    acceptInviteBodyValidator,
    SUBUSER_STORE_ALLOWED_KEYS,
    subuserShowQueryValidator,
    subuserStoreBodyValidator,
} from "../validators/subuser.validator";
import {
    ACTIVATE_ALLOWED_KEYS,
    activateBodyValidator,
    virtualAccountIdQueryValidator,
    virtualAccountListQueryValidator,
} from "../validators/virtual_account.validator";
import {
    changePasswordValidator,
    PASSWORD_ONLY_ALLOWED_KEYS,
    passwordOnlyBodyValidator,
    passwordVerificationBodyValidator,
    TFA_STATUS_ALLOWED_KEYS,
    UPDATE_PROFILE_ALLOWED_KEYS,
    updateProfileBodyValidator,
} from "../validators/profile.validator";
import {
    FORCE_RESET_ALLOWED_KEYS,
    forceResetPasswordBodyValidator,
    TEAM_CHANGE_PASSWORD_ALLOWED_KEYS,
    TEAM_FORGOT_ALLOWED_KEYS,
    TEAM_LOGIN_ALLOWED_KEYS,
    TEAM_MEMBER_CREATE_ALLOWED_KEYS,
    TEAM_MEMBER_UPDATE_ALLOWED_KEYS,
    TEAM_RESET_PASSWORD_ALLOWED_KEYS,
    TEAM_VERIFY_CODE_ALLOWED_KEYS,
    teamChangePasswordBodyValidator,
    teamForgotPasswordBodyValidator,
    teamLoginBodyValidator,
    teamMemberCreateBodyValidator,
    teamMemberListQueryValidator,
    teamMemberShowBodyValidator,
    teamMemberShowQueryValidator,
    teamMemberUpdateBodyValidator,
    teamResetPasswordBodyValidator,
    teamVerifyCodeBodyValidator,
} from "../validators/team.validator";

/**
 * Central registry of every route's path + middleware chain.
 *
 * Each route file imports the entry it needs from here so route
 * definitions stay declarative and the middleware ordering is
 * consistent across the codebase.
 */
export const authApiRoutes = {
    REGISTER: {
        path: "/register",
        middleware: [
            strictBody(REGISTER_ALLOWED_KEYS),
            registerValidator,
            checkValidationErrors,
        ],
    },
    VERIFY_OTP: {
        path: "/verify-otp",
        middleware: [verifyOtpValidator, checkValidationErrors],
    },
    RESEND_OTP: {
        path: "/resend-otp",
        middleware: [emailOnlyValidator, checkValidationErrors],
    },
    LOGIN: {
        path: "/login",
        middleware: [loginValidator, checkValidationErrors],
    },
    TFA_LOGIN: {
        path: "/tfa-login",
        middleware: [tfaLoginValidator, checkValidationErrors],
    },
    FORGOT_SEND_LINK: {
        path: "/forgot-password/send-reset-link",
        middleware: [emailOnlyValidator, checkValidationErrors],
    },
    FORGOT_VERIFY_CODE: {
        path: "/forgot-password/verify-code",
        middleware: [verifyCodeValidator, checkValidationErrors],
    },
    FORGOT_RESET_PASSWORD: {
        path: "/forgot-password/reset-password",
        middleware: [resetPasswordValidator, checkValidationErrors],
    },
    LOGOUT: {
        path: "/logout",
        middleware: [authSanctum],
    },
};

export const profileApiRoutes = {
    PROFILE: {
        path: "/profile",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant],
    },
    GET_CREDENTIALS: {
        path: "/get-credentials",
        middleware: [authSanctum, emailShouldBeVerified],
    },
    CHANGE_PASSWORD: {
        path: "/change-password",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            changePasswordValidator,
            checkValidationErrors,
        ],
    },
    UPDATE_TOUR_STATUS: {
        path: "/update-tour-status",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant],
    },
    DELETE_ACCOUNT: {
        path: "/delete-account",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            strictBody(PASSWORD_ONLY_ALLOWED_KEYS),
            passwordOnlyBodyValidator,
            checkValidationErrors,
        ],
    },
    CHECK_USER_STATUS: {
        path: "/check_user_status",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant],
    },
    SETUP_TFA: {
        path: "/setup-tfa",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant],
    },
    TFA_STATUS: {
        path: "/tfa-status",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            strictBody(TFA_STATUS_ALLOWED_KEYS),
            passwordVerificationBodyValidator,
            checkValidationErrors,
        ],
    },
    REGENERATE_BACKUP_CODES: {
        path: "/regenerate-backup-codes",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            strictBody(PASSWORD_ONLY_ALLOWED_KEYS),
            passwordOnlyBodyValidator,
            checkValidationErrors,
        ],
    },
    UPDATE_PROFILE_FORM_FIELDS: {
        path: "/update-profile-form-fields",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant],
    },
    UPDATE_PROFILE: {
        path: "/update-profile",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            strictBody(UPDATE_PROFILE_ALLOWED_KEYS),
            updateProfileBodyValidator,
            checkValidationErrors,
        ],
    },
};

export const onboardingApiRoutes = {
    GET_FORM_FIELDS: {
        path: "/get-form-fields",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            emailShouldBeVerified,
            getFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    STEP_TWO: {
        path: "/stepTwo",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant, emailShouldBeVerified],
    },
    STEP_THREE: {
        path: "/stepThree",
        middleware: [authSanctum, appSignatureIfEnforced, validateMerchant, emailShouldBeVerified],
    },
};

// Shared stack for the beneficiary group (mirror of the legacy
// router-level middleware ordering).
const beneficiaryBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const beneficiaryApiRoutes = {
    GET_FORM_FIELDS: {
        path: "/get-form-fields",
        middleware: [
            ...beneficiaryBaseMiddleware,
            beneficiaryFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    LIST: {
        path: "/list",
        middleware: [
            ...beneficiaryBaseMiddleware,
            beneficiaryListQueryValidator,
            checkValidationErrors,
        ],
    },
    STORE: {
        // Body is validated dynamically against beneficiaryFormFields
        // inside the controller, so no static validator here.
        path: "/store",
        middleware: [...beneficiaryBaseMiddleware],
    },
    VALIDATE_ACCOUNT: {
        path: "/validate_account",
        middleware: [
            ...beneficiaryBaseMiddleware,
            validateAccountBodyValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...beneficiaryBaseMiddleware,
            beneficiaryShowQueryValidator,
            checkValidationErrors,
        ],
    },
    DELETE: {
        path: "/delete",
        middleware: [
            ...beneficiaryBaseMiddleware,
            beneficiaryShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BULK_TEMPLATE: {
        path: "/bulk/template",
        middleware: [...beneficiaryBaseMiddleware],
    },
    BULK_STORE: {
        path: "/bulk/store",
        middleware: [...beneficiaryBaseMiddleware],
    },
};

// Shared stack for the beneficiary-transaction (payout) group —
// mirror of the legacy payout.routes router-level ordering. The
// money-moving POSTs additionally run the Idempotency-Key middleware.
const transactionBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const beneficiaryTransactionApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [
            ...transactionBaseMiddleware,
            transactionListQueryValidator,
            checkValidationErrors,
        ],
    },
    STORE: {
        path: "/store",
        middleware: [
            ...transactionBaseMiddleware,
            idempotency(),
            strictBody(TRANSACTION_STORE_ALLOWED_KEYS),
            transactionStoreBodyValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...transactionBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    CHECK_TRANSACTION_STATUS: {
        path: "/check_transaction_status",
        middleware: [
            ...transactionBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    CHECK_STATUS: {
        path: "/check_status",
        middleware: [
            ...transactionBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    UPDATE_STATUS: {
        path: "/update-status",
        middleware: [
            ...transactionBaseMiddleware,
            idempotency(),
            strictBody(TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS),
            transactionUpdateStatusBodyValidator,
            checkValidationErrors,
        ],
    },
    CANCEL: {
        path: "/cancel",
        middleware: [
            ...transactionBaseMiddleware,
            idempotency(),
            strictBody(TRANSACTION_CANCEL_ALLOWED_KEYS),
            transactionCancelBodyValidator,
            checkValidationErrors,
        ],
    },
    GET_FORM_FIELDS: {
        path: "/get-form-fields",
        middleware: [
            ...transactionBaseMiddleware,
            payoutFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    TRANSACTION_FORM_FIELDS: {
        path: "/transaction-form-fields",
        middleware: [...transactionBaseMiddleware],
    },
    DIRECT: {
        path: "/direct",
        middleware: [
            ...transactionBaseMiddleware,
            idempotency(),
            strictBody(DIRECT_ALLOWED_KEYS),
            sendMoneyDirectBodyValidator,
            checkValidationErrors,
        ],
    },
    INSTANT_GET_FORM_FIELDS: {
        path: "/instant/get-form-fields",
        middleware: [
            ...transactionBaseMiddleware,
            payoutFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    INSTANT_STORE: {
        path: "/instant/store",
        middleware: [
            ...transactionBaseMiddleware,
            idempotency(),
            strictBody(INSTANT_ALLOWED_KEYS),
            instantPayoutBodyValidator,
            checkValidationErrors,
        ],
    },
    REQUEST_PROOF: {
        path: "/request-proof",
        middleware: [
            ...transactionBaseMiddleware,
            strictBody(PROOF_REQUEST_ALLOWED_KEYS),
            proofRequestBodyValidator,
            checkValidationErrors,
        ],
    },
    GET_PROOF: {
        path: "/get-proof",
        middleware: [
            ...transactionBaseMiddleware,
            proofGetQueryValidator,
            checkValidationErrors,
        ],
    },
    BULK_TEMPLATE: {
        path: "/bulk/template",
        middleware: [...transactionBaseMiddleware],
    },
    BULK_STORE: {
        path: "/bulk/store",
        middleware: [...transactionBaseMiddleware],
    },
    DOWNLOAD: {
        // No query validator — mirror of the legacy route, which
        // registers /download bare (filters are best-effort).
        path: "/download",
        middleware: [...transactionBaseMiddleware],
    },
    EXPORT: {
        // Same query validator as /show (legacy parity).
        path: "/export",
        middleware: [
            ...transactionBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    EXPORT_MULTIPLE: {
        path: "/export-multiple",
        middleware: [
            ...transactionBaseMiddleware,
            transactionExportMultipleQueryValidator,
            checkValidationErrors,
        ],
    },
};

// Shared stack for the wallets group (mirror of the legacy
// wallets.routes router-level ordering).
const walletBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const walletApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [
            ...walletBaseMiddleware,
            walletListQueryValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...walletBaseMiddleware,
            walletShowQueryValidator,
            checkValidationErrors,
        ],
    },
    CONVERT: {
        path: "/convert",
        middleware: [
            ...walletBaseMiddleware,
            idempotency(),
            strictBody(WALLET_CONVERT_ALLOWED_KEYS),
            walletConvertBodyValidator,
            checkValidationErrors,
        ],
    },
    TRANSACTIONS_LIST: {
        path: "/transactions/list",
        middleware: [
            ...walletBaseMiddleware,
            walletTransactionsQueryValidator,
            checkValidationErrors,
        ],
    },
    TRANSACTIONS_SHOW: {
        path: "/transactions/show",
        middleware: [
            ...walletBaseMiddleware,
            walletTransactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
};

// Shared stack for the deposits group (mirror of the legacy
// deposits.routes router-level ordering).
const depositBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const depositApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [
            ...depositBaseMiddleware,
            depositListQueryValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...depositBaseMiddleware,
            depositShowQueryValidator,
            checkValidationErrors,
        ],
    },
    QUOTE: {
        path: "/quote",
        middleware: [
            ...depositBaseMiddleware,
            depositQuoteQueryValidator,
            checkValidationErrors,
        ],
    },
    STORE: {
        path: "/store",
        middleware: [
            ...depositBaseMiddleware,
            idempotency(),
            strictBody(DEPOSIT_STORE_ALLOWED_KEYS),
            depositStoreBodyValidator,
            checkValidationErrors,
        ],
    },
    EXPORT: {
        // No query validator — mirror of the legacy route, which
        // registers /export bare (filters are best-effort).
        path: "/export",
        middleware: [...depositBaseMiddleware],
    },
};

// Shared stack for the virtual-accounts group (mirror of the legacy
// virtualAccounts.routes router-level ordering).
const virtualAccountBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const virtualAccountApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [
            ...virtualAccountBaseMiddleware,
            virtualAccountListQueryValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...virtualAccountBaseMiddleware,
            virtualAccountIdQueryValidator,
            checkValidationErrors,
        ],
    },
    AVAILABLE_BANKS: {
        path: "/available_banks",
        middleware: [...virtualAccountBaseMiddleware],
    },
    ACTIVATE: {
        path: "/activate",
        middleware: [
            ...virtualAccountBaseMiddleware,
            strictBody(ACTIVATE_ALLOWED_KEYS),
            activateBodyValidator,
            checkValidationErrors,
        ],
    },
    GET_ACCOUNT_BALANCE: {
        path: "/get_account_balance",
        middleware: [
            ...virtualAccountBaseMiddleware,
            virtualAccountIdQueryValidator,
            checkValidationErrors,
        ],
    },
    GET_VIRTUAL_ACCOUNTS: {
        path: "/get_virtual_Accounts",
        middleware: [...virtualAccountBaseMiddleware],
    },
    BALANCES: {
        path: "/balances",
        middleware: [...virtualAccountBaseMiddleware],
    },
};

// Shared stack for the remitters group (mirror of the legacy
// senders.routes router-level ordering).
const senderBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const senderApiRoutes = {
    GET_FORM_FIELDS: {
        path: "/get-form-fields",
        middleware: [
            ...senderBaseMiddleware,
            senderFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    LIST: {
        path: "/list",
        middleware: [
            ...senderBaseMiddleware,
            senderListQueryValidator,
            checkValidationErrors,
        ],
    },
    STORE: {
        // Body is validated dynamically against senderFields inside
        // the normalizer, so no static validator here (same as the
        // beneficiary store).
        path: "/store",
        middleware: [...senderBaseMiddleware],
    },
    UPDATE: {
        path: "/update",
        middleware: [
            ...senderBaseMiddleware,
            senderUpdateBodyValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...senderBaseMiddleware,
            senderShowQueryValidator,
            checkValidationErrors,
        ],
    },
    DELETE: {
        path: "/delete",
        middleware: [
            ...senderBaseMiddleware,
            senderShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BULK_TEMPLATE: {
        path: "/bulk/template",
        middleware: [...senderBaseMiddleware],
    },
    BULK_STORE: {
        path: "/bulk/store",
        middleware: [...senderBaseMiddleware],
    },
};

// Shared stack for the read-only reporting groups (dashboard,
// ledgers, statement) — mirror of the legacy router-level ordering.
const reportingBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    validateMerchant,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
];

export const dashboardApiRoutes = {
    STATISTICS: {
        path: "/statistics",
        middleware: [
            ...reportingBaseMiddleware,
            dashboardStatisticsQueryValidator,
            checkValidationErrors,
        ],
    },
    CHARTS_DATA: {
        path: "/charts-data",
        middleware: [
            ...reportingBaseMiddleware,
            dashboardChartsDataQueryValidator,
            checkValidationErrors,
        ],
    },
};

export const ledgerApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [
            ...reportingBaseMiddleware,
            ledgerListQueryValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...reportingBaseMiddleware,
            ledgerShowQueryValidator,
            checkValidationErrors,
        ],
    },
    EXPORT: {
        // Same query validator as the list (legacy parity).
        path: "/export",
        middleware: [
            ...reportingBaseMiddleware,
            ledgerListQueryValidator,
            checkValidationErrors,
        ],
    },
};

export const statementApiRoutes = {
    EXPORT: {
        path: "/export",
        middleware: [
            ...reportingBaseMiddleware,
            statementExportQueryValidator,
            checkValidationErrors,
        ],
    },
};

export const settingApiRoutes = {
    GET_SETTINGS: {
        path: "/get_settings",
        middleware: [],
    },
};

export const staticPageApiRoutes = {
    LIST: {
        path: "/list",
        middleware: [],
    },
    SHOW: {
        path: "/show",
        middleware: [staticPageShowQueryValidator, checkValidationErrors],
    },
};

// Subusers: accept-invite is anonymous; the rest sit behind the
// business-user stack (legacy ordering: email verification BEFORE
// validateMerchant on this group).
const subuserBaseMiddleware = [
    authSanctum,
    appSignatureIfEnforced,
    emailShouldBeVerified,
    validateMerchant,
    onboardingShouldBeCompleted,
    businessUserAccess,
];

export const subuserApiRoutes = {
    ACCEPT_INVITE: {
        path: "/accept-invite",
        middleware: [
            strictBody(ACCEPT_INVITE_ALLOWED_KEYS),
            acceptInviteBodyValidator,
            checkValidationErrors,
        ],
    },
    LIST: {
        path: "/list",
        middleware: [...subuserBaseMiddleware],
    },
    STORE: {
        path: "/store",
        middleware: [
            ...subuserBaseMiddleware,
            strictBody(SUBUSER_STORE_ALLOWED_KEYS),
            subuserStoreBodyValidator,
            checkValidationErrors,
        ],
    },
    SHOW: {
        path: "/show",
        middleware: [
            ...subuserBaseMiddleware,
            subuserShowQueryValidator,
            checkValidationErrors,
        ],
    },
    DELETE: {
        path: "/delete",
        middleware: [
            ...subuserBaseMiddleware,
            subuserShowQueryValidator,
            checkValidationErrors,
        ],
    },
};

// Public retry / status routes (no auth — mirror of the legacy
// payoutPublicRoutes + retryDepositRoute mounting).
export const publicApiRoutes = {
    RETRY_JOB: {
        path: "/retry-job/:jobId",
        middleware: [retryJobParamValidator, checkValidationErrors],
    },
    CHECK_EXTERNAL_SERVICE_STATUS: {
        path: "/check_external_service_status/:trxn",
        middleware: [retryTrxnParamValidator, checkValidationErrors],
    },
    RETRY_DEPOSIT: {
        path: "/retry_deposit/:trxn",
        middleware: [retryTrxnParamValidator, checkValidationErrors],
    },
    RETRY_EXTERNAL_SERVICE: {
        path: "/retry_external_service/:trxn",
        middleware: [retryTrxnParamValidator, checkValidationErrors],
    },
};

// Inbound provider webhooks — unauthenticated flat paths at the API
// root (providers have these exact URLs registered); FvBank is the
// only one gated, by its HMAC signature middleware.
export const webhookApiRoutes = {
    CALIZA: {
        path: "/caliza-webhook",
        middleware: [],
    },
    DIGININE: {
        path: "/diginine-webhook",
        middleware: [],
    },
    FVBANK: {
        path: "/ef-webhook",
        middleware: [fvbankWebhookSignature],
    },
    COMPLIANCE: {
        path: "/compliance/webhook-callback",
        middleware: [],
    },
    PROCESSING_UNIT: {
        path: "/processingunit-webhook",
        middleware: [],
    },
};

export const lookupApiRoutes = {
    MOBILE_COUNTRY_CODES: {
        path: "/mobile_country_codes",
        middleware: [],
    },
    COUNTRIES: {
        path: "/countries",
        middleware: [],
    },
    STATES: {
        path: "/states",
        middleware: [statesQueryValidator, checkValidationErrors],
    },
    PAYMENT_RAILS: {
        path: "/payment_rails",
        middleware: [],
    },
    DEPOSIT_LOOKUPS: {
        path: "/deposit_lookups",
        middleware: [depositLookupsQueryValidator, checkValidationErrors],
    },
    DEPOSIT_WALLETS: {
        path: "/deposit_wallets",
        middleware: [],
    },
    BANKS: {
        path: "/banks",
        middleware: [banksQueryValidator, checkValidationErrors],
    },
    // Authenticated lookups — the legacy stack orders emailShouldBeVerified
    // BEFORE validateMerchant here (unlike the beneficiary group).
    RECEIVING_COUNTRIES: {
        path: "/receiving_countries",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            emailShouldBeVerified,
            validateMerchant,
            onboardingShouldBeCompleted,
            receivingCountriesQueryValidator,
            checkValidationErrors,
        ],
    },
    GET_RATES: {
        path: "/get-rates",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            emailShouldBeVerified,
            validateMerchant,
            onboardingShouldBeCompleted,
        ],
    },
    REFRESH_RATES: {
        path: "/refresh-rates",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            emailShouldBeVerified,
            validateMerchant,
            onboardingShouldBeCompleted,
            refreshRatesBodyValidator,
            checkValidationErrors,
        ],
    },
};

export const quoteApiRoutes = {
    STORE: {
        path: "/store",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            emailShouldBeVerified,
            onboardingShouldBeCompleted,
            quoteStoreValidator,
            checkValidationErrors,
            quoteStoreCrossFieldRules,
        ],
    },
    EXCHANGE_RATE: {
        path: "/exchange-rate",
        middleware: [
            authSanctum,
            appSignatureIfEnforced,
            validateMerchant,
            emailShouldBeVerified,
            onboardingShouldBeCompleted,
            quoteStoreValidator,
            checkValidationErrors,
            quoteStoreCrossFieldRules,
        ],
    },
};

/**
 * Team (corporate) public routes — mounted at "/" so each path carries
 * its own /corporate or /team prefix. No auth: these are the login,
 * force-reset, public lookup and forgot-password endpoints. Mirror of
 * the pre-refactor teamPublicRouter in routes/team.route.ts.
 */
export const teamAuthApiRoutes = {
    CORPORATE_LOGIN: {
        path: "/corporate/login",
        middleware: [
            strictBody(TEAM_LOGIN_ALLOWED_KEYS),
            teamLoginBodyValidator,
            checkValidationErrors,
        ],
    },
    TEAM_LOGIN: {
        path: "/team/login",
        middleware: [
            strictBody(TEAM_LOGIN_ALLOWED_KEYS),
            teamLoginBodyValidator,
            checkValidationErrors,
        ],
    },
    FORCE_RESET_PASSWORD: {
        path: "/team/force-reset-password",
        middleware: [
            strictBody(FORCE_RESET_ALLOWED_KEYS),
            forceResetPasswordBodyValidator,
            checkValidationErrors,
        ],
    },
    GET_SETTINGS: {
        path: "/team/get_settings",
        middleware: [],
    },
    LOOKUP_MOBILE_COUNTRY_CODES: {
        path: "/team/lookups/mobile_country_codes",
        middleware: [],
    },
    LOOKUP_COUNTRIES: {
        path: "/team/lookups/countries",
        middleware: [],
    },
    LOOKUP_STATES: {
        path: "/team/lookups/states",
        middleware: [statesQueryValidator, checkValidationErrors],
    },
    LOOKUP_PAYMENT_RAILS: {
        path: "/team/lookups/payment_rails",
        middleware: [],
    },
    LOOKUP_DEPOSIT_LOOKUPS: {
        path: "/team/lookups/deposit_lookups",
        middleware: [depositLookupsQueryValidator, checkValidationErrors],
    },
    LOOKUP_DEPOSIT_WALLETS: {
        path: "/team/lookups/deposit_wallets",
        middleware: [],
    },
    FORGOT_SEND_RESET_LINK: {
        path: "/team/forgot-password/send-reset-link",
        middleware: [
            strictBody(TEAM_FORGOT_ALLOWED_KEYS),
            teamForgotPasswordBodyValidator,
            checkValidationErrors,
        ],
    },
    FORGOT_VERIFY_CODE: {
        path: "/team/forgot-password/verify-code",
        middleware: [
            strictBody(TEAM_VERIFY_CODE_ALLOWED_KEYS),
            teamVerifyCodeBodyValidator,
            checkValidationErrors,
        ],
    },
    FORGOT_RESET_PASSWORD: {
        path: "/team/forgot-password/reset-password",
        middleware: [
            strictBody(TEAM_RESET_PASSWORD_ALLOWED_KEYS),
            teamResetPasswordBodyValidator,
            checkValidationErrors,
        ],
    },
};

/**
 * Shared stack for every authenticated team route (mounted at "/team").
 * authTeam sets req.user to the parent business user and req.teamMember
 * drives the corporate scoping; teamPasswordResetGate blocks callers who
 * must reset before continuing. Team routes stay unsigned — the app
 * signature resolver only understands User callers today, so
 * appSignatureIfEnforced is intentionally excluded here.
 */
const teamBaseMiddleware = [authTeam, teamPasswordResetGate];

export const teamApiRoutes = {
    GET_CREDENTIALS: {
        path: "/get-credentials",
        middleware: [...teamBaseMiddleware],
    },
    LOGOUT: {
        path: "/logout",
        middleware: [...teamBaseMiddleware],
    },
    PROFILE: {
        path: "/profile",
        middleware: [...teamBaseMiddleware],
    },
    CHANGE_PASSWORD: {
        path: "/change-password",
        middleware: [
            ...teamBaseMiddleware,
            strictBody(TEAM_CHANGE_PASSWORD_ALLOWED_KEYS),
            teamChangePasswordBodyValidator,
            checkValidationErrors,
        ],
    },

    // Owner-only TeamMember CRUD.
    TEAM_MEMBERS_LIST: {
        path: "/team-members/list",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            teamMemberListQueryValidator,
            checkValidationErrors,
        ],
    },
    TEAM_MEMBERS_CREATE: {
        path: "/team-members/create",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            strictBody(TEAM_MEMBER_CREATE_ALLOWED_KEYS),
            teamMemberCreateBodyValidator,
            checkValidationErrors,
        ],
    },
    TEAM_MEMBERS_SHOW: {
        path: "/team-members/show",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            teamMemberShowQueryValidator,
            checkValidationErrors,
        ],
    },
    TEAM_MEMBERS_UPDATE: {
        path: "/team-members/update",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            strictBody(TEAM_MEMBER_UPDATE_ALLOWED_KEYS),
            teamMemberUpdateBodyValidator,
            checkValidationErrors,
        ],
    },
    TEAM_MEMBERS_UPDATE_STATUS: {
        path: "/team-members/update-status",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            teamMemberShowBodyValidator,
            checkValidationErrors,
        ],
    },
    TEAM_MEMBERS_DELETE: {
        path: "/team-members/delete",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            teamMemberShowQueryValidator,
            checkValidationErrors,
        ],
    },

    // Virtual accounts
    ACCOUNTS_LIST: {
        path: "/accounts/list",
        middleware: [
            ...teamBaseMiddleware,
            virtualAccountListQueryValidator,
            checkValidationErrors,
        ],
    },
    ACCOUNTS_SHOW: {
        path: "/accounts/show",
        middleware: [
            ...teamBaseMiddleware,
            virtualAccountIdQueryValidator,
            checkValidationErrors,
        ],
    },
    ACCOUNTS_GET_BALANCE: {
        path: "/accounts/get_account_balance",
        middleware: [
            ...teamBaseMiddleware,
            virtualAccountIdQueryValidator,
            checkValidationErrors,
        ],
    },
    ACCOUNTS_ACTIVATE: {
        path: "/accounts/activate",
        middleware: [
            ...teamBaseMiddleware,
            strictBody(ACTIVATE_ALLOWED_KEYS),
            activateBodyValidator,
            checkValidationErrors,
        ],
    },
    ACCOUNTS_GET_VIRTUAL_ACCOUNTS: {
        path: "/accounts/get_virtual_Accounts",
        middleware: [...teamBaseMiddleware],
    },

    // Deposits
    DEPOSITS_LIST: {
        path: "/deposits/list",
        middleware: [
            ...teamBaseMiddleware,
            depositListQueryValidator,
            checkValidationErrors,
        ],
    },
    DEPOSITS_QUOTE: {
        path: "/deposits/quote",
        middleware: [
            ...teamBaseMiddleware,
            depositQuoteQueryValidator,
            checkValidationErrors,
        ],
    },
    DEPOSITS_STORE: {
        path: "/deposits/store",
        middleware: [
            ...teamBaseMiddleware,
            idempotency(),
            strictBody(DEPOSIT_STORE_ALLOWED_KEYS),
            depositStoreBodyValidator,
            checkValidationErrors,
        ],
    },
    DEPOSITS_SHOW: {
        path: "/deposits/show",
        middleware: [
            ...teamBaseMiddleware,
            depositShowQueryValidator,
            checkValidationErrors,
        ],
    },
    DEPOSITS_EXPORT: {
        // No validator — mirror of the legacy team mount.
        path: "/deposits/export",
        middleware: [...teamBaseMiddleware],
    },

    // Beneficiary accounts
    BENEFICIARIES_GET_FORM_FIELDS: {
        path: "/beneficiaries/get-form-fields",
        middleware: [
            ...teamBaseMiddleware,
            beneficiaryFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARIES_LIST: {
        path: "/beneficiaries/list",
        middleware: [
            ...teamBaseMiddleware,
            beneficiaryListQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARIES_STORE: {
        path: "/beneficiaries/store",
        middleware: [...teamBaseMiddleware],
    },
    BENEFICIARIES_SHOW: {
        path: "/beneficiaries/show",
        middleware: [
            ...teamBaseMiddleware,
            beneficiaryShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARIES_DELETE: {
        path: "/beneficiaries/delete",
        middleware: [
            ...teamBaseMiddleware,
            beneficiaryShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARIES_BULK_TEMPLATE: {
        path: "/beneficiaries/bulk/template",
        middleware: [...teamBaseMiddleware],
    },
    BENEFICIARIES_BULK_STORE: {
        path: "/beneficiaries/bulk/store",
        middleware: [...teamBaseMiddleware],
    },

    // Senders (remitters)
    REMITTERS_GET_FORM_FIELDS: {
        path: "/remitters/get-form-fields",
        middleware: [
            ...teamBaseMiddleware,
            senderFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    REMITTERS_LIST: {
        path: "/remitters/list",
        middleware: [
            ...teamBaseMiddleware,
            senderListQueryValidator,
            checkValidationErrors,
        ],
    },
    REMITTERS_STORE: {
        path: "/remitters/store",
        middleware: [...teamBaseMiddleware],
    },
    REMITTERS_UPDATE: {
        path: "/remitters/update",
        middleware: [
            ...teamBaseMiddleware,
            senderUpdateBodyValidator,
            checkValidationErrors,
        ],
    },
    REMITTERS_SHOW: {
        path: "/remitters/show",
        middleware: [
            ...teamBaseMiddleware,
            senderShowQueryValidator,
            checkValidationErrors,
        ],
    },
    REMITTERS_DELETE: {
        path: "/remitters/delete",
        middleware: [
            ...teamBaseMiddleware,
            senderShowQueryValidator,
            checkValidationErrors,
        ],
    },
    REMITTERS_BULK_TEMPLATE: {
        path: "/remitters/bulk/template",
        middleware: [...teamBaseMiddleware],
    },
    REMITTERS_BULK_STORE: {
        path: "/remitters/bulk/store",
        middleware: [...teamBaseMiddleware],
    },

    // Quotes
    QUOTES_STORE: {
        path: "/quotes/store",
        middleware: [
            ...teamBaseMiddleware,
            quoteStoreValidator,
            checkValidationErrors,
            quoteStoreCrossFieldRules,
        ],
    },
    QUOTES_EXCHANGE_RATE: {
        path: "/quotes/exchange-rate",
        middleware: [
            ...teamBaseMiddleware,
            quoteStoreValidator,
            checkValidationErrors,
            quoteStoreCrossFieldRules,
        ],
    },

    // Beneficiary transactions (the maker/checker dance)
    BENEFICIARY_TRANSACTIONS_LIST: {
        path: "/beneficiary-transactions/list",
        middleware: [
            ...teamBaseMiddleware,
            transactionListQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_STORE: {
        path: "/beneficiary-transactions/store",
        middleware: [
            ...teamBaseMiddleware,
            makerAccess,
            idempotency(),
            strictBody(TRANSACTION_STORE_ALLOWED_KEYS),
            transactionStoreBodyValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_SHOW: {
        path: "/beneficiary-transactions/show",
        middleware: [
            ...teamBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_CHECK_TRANSACTION_STATUS: {
        path: "/beneficiary-transactions/check_transaction_status",
        middleware: [
            ...teamBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_UPDATE_STATUS: {
        path: "/beneficiary-transactions/update-status",
        middleware: [
            ...teamBaseMiddleware,
            checkerAccess,
            idempotency(),
            strictBody(TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS),
            transactionUpdateStatusBodyValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_CANCEL: {
        path: "/beneficiary-transactions/cancel",
        middleware: [
            ...teamBaseMiddleware,
            idempotency(),
            strictBody(TRANSACTION_CANCEL_ALLOWED_KEYS),
            transactionCancelBodyValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_GET_FORM_FIELDS: {
        path: "/beneficiary-transactions/get-form-fields",
        middleware: [
            ...teamBaseMiddleware,
            payoutFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_DIRECT: {
        path: "/beneficiary-transactions/direct",
        middleware: [
            ...teamBaseMiddleware,
            idempotency(),
            strictBody(DIRECT_ALLOWED_KEYS),
            sendMoneyDirectBodyValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_EXPORT: {
        path: "/beneficiary-transactions/export",
        middleware: [
            ...teamBaseMiddleware,
            transactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_DOWNLOAD: {
        // No validator — mirror of the legacy team mount.
        path: "/beneficiary-transactions/download",
        middleware: [...teamBaseMiddleware],
    },
    BENEFICIARY_TRANSACTIONS_TRANSACTION_FORM_FIELDS: {
        path: "/beneficiary-transactions/transaction-form-fields",
        middleware: [...teamBaseMiddleware],
    },
    BENEFICIARY_TRANSACTIONS_REQUEST_PROOF: {
        path: "/beneficiary-transactions/request-proof",
        middleware: [
            ...teamBaseMiddleware,
            strictBody(PROOF_REQUEST_ALLOWED_KEYS),
            proofRequestBodyValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_GET_PROOF: {
        path: "/beneficiary-transactions/get-proof",
        middleware: [
            ...teamBaseMiddleware,
            proofGetQueryValidator,
            checkValidationErrors,
        ],
    },
    BENEFICIARY_TRANSACTIONS_BULK_TEMPLATE: {
        path: "/beneficiary-transactions/bulk/template",
        middleware: [...teamBaseMiddleware],
    },
    BENEFICIARY_TRANSACTIONS_BULK_STORE: {
        path: "/beneficiary-transactions/bulk/store",
        middleware: [...teamBaseMiddleware],
    },

    // Ledgers
    LEDGERS_LIST: {
        path: "/ledgers/list",
        middleware: [
            ...teamBaseMiddleware,
            ledgerListQueryValidator,
            checkValidationErrors,
        ],
    },
    LEDGERS_SHOW: {
        path: "/ledgers/show",
        middleware: [
            ...teamBaseMiddleware,
            ledgerShowQueryValidator,
            checkValidationErrors,
        ],
    },
    LEDGERS_EXPORT: {
        path: "/ledgers/export",
        middleware: [
            ...teamBaseMiddleware,
            ledgerListQueryValidator,
            checkValidationErrors,
        ],
    },

    // Statements
    STATEMENT_EXPORT: {
        path: "/statement/export",
        middleware: [
            ...teamBaseMiddleware,
            statementExportQueryValidator,
            checkValidationErrors,
        ],
    },

    // Authenticated lookups
    LOOKUPS_RECEIVING_COUNTRIES: {
        path: "/lookups/receiving_countries",
        middleware: [
            ...teamBaseMiddleware,
            receivingCountriesQueryValidator,
            checkValidationErrors,
        ],
    },
    LOOKUPS_GET_RATES: {
        path: "/lookups/get-rates",
        middleware: [...teamBaseMiddleware],
    },
    LOOKUPS_REFRESH_RATES: {
        path: "/lookups/refresh-rates",
        middleware: [
            ...teamBaseMiddleware,
            refreshRatesBodyValidator,
            checkValidationErrors,
        ],
    },
    LOOKUPS_BANKS: {
        path: "/lookups/banks",
        middleware: [
            ...teamBaseMiddleware,
            banksQueryValidator,
            checkValidationErrors,
        ],
    },

    // Dashboard
    DASHBOARD_STATISTICS: {
        path: "/dashboard/statistics",
        middleware: [
            ...teamBaseMiddleware,
            dashboardStatisticsQueryValidator,
            checkValidationErrors,
        ],
    },
    DASHBOARD_CHARTS_DATA: {
        path: "/dashboard/charts-data",
        middleware: [
            ...teamBaseMiddleware,
            dashboardChartsDataQueryValidator,
            checkValidationErrors,
        ],
    },

    // Wallets
    WALLETS_LIST: {
        path: "/wallets/list",
        middleware: [
            ...teamBaseMiddleware,
            walletListQueryValidator,
            checkValidationErrors,
        ],
    },
    WALLETS_SHOW: {
        path: "/wallets/show",
        middleware: [
            ...teamBaseMiddleware,
            walletShowQueryValidator,
            checkValidationErrors,
        ],
    },
    WALLETS_CONVERT: {
        path: "/wallets/convert",
        middleware: [
            ...teamBaseMiddleware,
            ownerAccess,
            idempotency(),
            strictBody(WALLET_CONVERT_ALLOWED_KEYS),
            walletConvertBodyValidator,
            checkValidationErrors,
        ],
    },
    WALLETS_TRANSACTIONS_LIST: {
        path: "/wallets/transactions/list",
        middleware: [
            ...teamBaseMiddleware,
            walletTransactionsQueryValidator,
            checkValidationErrors,
        ],
    },
    WALLETS_TRANSACTIONS_SHOW: {
        path: "/wallets/transactions/show",
        middleware: [
            ...teamBaseMiddleware,
            walletTransactionShowQueryValidator,
            checkValidationErrors,
        ],
    },
};
