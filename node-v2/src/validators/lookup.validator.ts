import { query, ValidationChain } from "express-validator";
import {
    LOOKUP_TYPE_PURPOSE_OF_TRANSACTION,
    LOOKUP_TYPE_SOURCE_OF_FUNDS,
} from "../utils/constants";
import { localizedError } from "./validation_message.helper";


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
 * express-validator chain for GET /api/user/lookups/banks
 * (mirror of the legacy GetBanksQuerySchema).
 */
export const banksQueryValidator: ValidationChain[] = [
    query("country_code")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),

    query("currency")
        .optional()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),
];

/**
 * express-validator chain for GET /api/user/lookups/receiving_countries
 * (mirror of the legacy ReceivingCountriesQuerySchema; PERSONAL/BUSINESS
 * is translated to the numeric user type in the controller).
 */
export const receivingCountriesQueryValidator: ValidationChain[] = [
    query("recipient_type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(["PERSONAL", "BUSINESS"])
        .withMessage(localizedError("1100", 1100)),
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
