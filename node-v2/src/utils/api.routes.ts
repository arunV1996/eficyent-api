import {
    authSanctum,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
} from "../middleware/auth";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { idempotency } from "../middleware/idempotency";
import { strictBody } from "../middleware/strictBody";
import { validateMerchant } from "../middleware/validateMerchant";
import {
    PROOF_REQUEST_ALLOWED_KEYS,
    proofGetQueryValidator,
    proofRequestBodyValidator,
    TRANSACTION_CANCEL_ALLOWED_KEYS,
    TRANSACTION_STORE_ALLOWED_KEYS,
    TRANSACTION_UPDATE_STATUS_ALLOWED_KEYS,
    transactionCancelBodyValidator,
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
    depositLookupsQueryValidator,
    statesQueryValidator,
} from "../validators/lookup.validator";
import { changePasswordValidator } from "../validators/profile.validator";

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
        middleware: [authSanctum, validateMerchant],
    },
    GET_CREDENTIALS: {
        path: "/get-credentials",
        middleware: [authSanctum, emailShouldBeVerified],
    },
    CHANGE_PASSWORD: {
        path: "/change-password",
        middleware: [
            authSanctum,
            validateMerchant,
            changePasswordValidator,
            checkValidationErrors,
        ],
    },
    UPDATE_TOUR_STATUS: {
        path: "/update-tour-status",
        middleware: [authSanctum, validateMerchant],
    },
};

export const onboardingApiRoutes = {
    GET_FORM_FIELDS: {
        path: "/get-form-fields",
        middleware: [
            authSanctum,
            validateMerchant,
            emailShouldBeVerified,
            getFormFieldsQueryValidator,
            checkValidationErrors,
        ],
    },
    STEP_TWO: {
        path: "/stepTwo",
        middleware: [authSanctum, validateMerchant, emailShouldBeVerified],
    },
    STEP_THREE: {
        path: "/stepThree",
        middleware: [authSanctum, validateMerchant, emailShouldBeVerified],
    },
};

// Shared stack for the beneficiary group (mirror of the legacy
// router-level middleware ordering).
const beneficiaryBaseMiddleware = [
    authSanctum,
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
};

// Shared stack for the beneficiary-transaction (payout) group —
// mirror of the legacy payout.routes router-level ordering. The
// money-moving POSTs additionally run the Idempotency-Key middleware.
const transactionBaseMiddleware = [
    authSanctum,
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
};

// Shared stack for the wallets group (mirror of the legacy
// wallets.routes router-level ordering).
const walletBaseMiddleware = [
    authSanctum,
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
            emailShouldBeVerified,
            validateMerchant,
            onboardingShouldBeCompleted,
        ],
    },
    REFRESH_RATES: {
        path: "/refresh-rates",
        middleware: [
            authSanctum,
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
            validateMerchant,
            emailShouldBeVerified,
            onboardingShouldBeCompleted,
            quoteStoreValidator,
            checkValidationErrors,
            quoteStoreCrossFieldRules,
        ],
    },
};
