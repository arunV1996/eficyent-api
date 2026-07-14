import {
    authSanctum,
    emailShouldBeVerified,
    onboardingShouldBeCompleted,
} from "../middleware/auth";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { validateMerchant } from "../middleware/validateMerchant";
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
    loginValidator,
    registerValidator,
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
        middleware: [registerValidator, checkValidationErrors],
    },
    LOGIN: {
        path: "/login",
        middleware: [loginValidator, checkValidationErrors],
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
    CHANGE_PASSWORD: {
        path: "/change-password",
        middleware: [
            authSanctum,
            changePasswordValidator,
            checkValidationErrors,
        ],
    },
    UPDATE_TOUR_STATUS: {
        path: "/update-tour-status",
        middleware: [authSanctum],
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
};
