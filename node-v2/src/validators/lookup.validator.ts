import { query, ValidationChain } from "express-validator";
import {
    LOOKUP_TYPE_PURPOSE_OF_TRANSACTION,
    LOOKUP_TYPE_SOURCE_OF_FUNDS,
} from "../utils/constants";

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

/**
 * express-validator chain for GET /api/user/lookups/states.
 * country_code is optional; when present it must be a 2- or 3-letter
 * ISO country code (matches the legacy StatesQuerySchema).
 */
export const statesQueryValidator: ValidationChain[] = [
    query("country_code")
        .optional()
        .isString()
        .isLength({ min: 2, max: 3 })
        .withMessage(localizedError("1104", 1104)),
];

/**
 * express-validator chain for GET /api/user/lookups/deposit_lookups.
 * type is required and must be one of the two deposit lookup groups
 * (matches the legacy DepositLookupQuerySchema).
 */
export const depositLookupsQueryValidator: ValidationChain[] = [
    query("type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn([LOOKUP_TYPE_SOURCE_OF_FUNDS, LOOKUP_TYPE_PURPOSE_OF_TRANSACTION])
        .withMessage(localizedError("1105", 1105)),
];
