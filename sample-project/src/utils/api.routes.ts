import {
    registerValidator,
    loginValidator,
} from "../validators/auth.validator";
import { depositValidator } from "../validators/deposit.validator";
import { withdrawValidator } from "../validators/withdraw.validator";
import { transferValidator } from "../validators/transfer.validator";
import { checkValidationErrors } from "../middleware/checkValidationErrors";
import { verifyJWT } from "../middleware/auth";

export const authApiRoutes = {
    REGISTER: {
        path: "/register",
        middleware: [registerValidator, checkValidationErrors],
    },
    LOGIN: {
        path: "/login",
        middleware: [loginValidator, checkValidationErrors],
    },
};

export const depositApiRoutes = {
    DEPOSIT: {
        path: "/",
        middleware: [verifyJWT, depositValidator, checkValidationErrors],
    },
};

export const withdrawApiRoutes = {
    WITHDRAW: {
        path: "/",
        middleware: [verifyJWT, withdrawValidator, checkValidationErrors],
    },
};

export const transferApiRoutes = {
    TRANSFER: {
        path: "/",
        middleware: [verifyJWT, transferValidator, checkValidationErrors],
    },
};
