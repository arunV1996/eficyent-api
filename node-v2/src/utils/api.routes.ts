import { authSanctum } from "../middleware/auth";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import {
    loginValidator,
    registerValidator,
} from "../validators/auth.validator";
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
