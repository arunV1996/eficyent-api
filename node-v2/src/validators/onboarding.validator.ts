import { query, ValidationChain } from "express-validator";
import { ONBOARDING_STEP_MAP } from "../utils/constants";
import { localizedError } from "./validation_message.helper";


/**
 * express-validator chain for GET /api/user/onboarding/get-form-fields.
 * `type` is one of REGISTER_USER / GET_INFORMATION / GET_DOCUMENTS
 * (translated to the numeric step in the controller);
 * country_of_incorporation is an optional 2-3 letter country code.
 * Mirrors the legacy GetFormFieldsSchema.
 */
export const getFormFieldsQueryValidator: ValidationChain[] = [
    query("type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isIn(Object.keys(ONBOARDING_STEP_MAP))
        .withMessage(localizedError("1106", 1106)),

    query("country_of_incorporation")
        .optional()
        .isString()
        .isLength({ min: 2, max: 3 })
        .withMessage(localizedError("1104", 1104)),
];
