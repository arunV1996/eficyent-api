import { body, query, ValidationChain } from "express-validator";
import { USER_TYPE_MAP } from "../utils/constants";
import { localizedError } from "./validation_message.helper";


/**
 * express-validator chain for GET /beneficiaries/get-form-fields
 * (mirror of FormFieldsQuerySchema: type accepts the numeric user type
 * or the PERSONAL/BUSINESS labels).
 */
export const beneficiaryFormFieldsQueryValidator: ValidationChain[] = [
    // USA/BGD corridors must specify which payment rail the form is for.
    query("payment_rail")
        .custom((value, { req }) => {
            const country = String(
                (req.query as Record<string, unknown> | undefined)?.country ??
                    "",
            ).toUpperCase();
            if (country === "USA" || country === "BGD") {
                return (
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ""
                );
            }
            return true;
        })
        .withMessage(() => ({
            msg: "The payment rail field is required.",
            code: 422,
        })),

    query("type")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .custom((value) => {
            if (/^[12]$/.test(String(value))) {
                return true;
            }
            return Object.keys(USER_TYPE_MAP).includes(String(value));
        })
        .withMessage(localizedError("1100", 1100)),

    query("country")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 2, max: 3 })
        .withMessage(localizedError("1104", 1104)),

    query("currency")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Za-z]{3}$/)
        .withMessage(localizedError("1104", 1104)),
];

/**
 * express-validator chain for GET /beneficiaries/show and
 * DELETE /beneficiaries/delete (mirror of BeneficiaryShowSchema).
 */
export const beneficiaryShowQueryValidator: ValidationChain[] = [
    query("beneficiary_account_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),
];

/**
 * express-validator chain for POST /beneficiaries/validate_account
 * (mirror of ValidateAccountSchema — Indian bank account + IFSC).
 */
export const validateAccountBodyValidator: ValidationChain[] = [
    body("account_number")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^\d{9,18}$/)
        .withMessage(() => ({
            msg: "The selected account number is invalid.",
            code: 422,
        })),

    body("ifsc")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
        .withMessage(() => ({
            msg: "The selected IFSC is invalid.",
            code: 422,
        })),
];

/**
 * express-validator chain for GET /beneficiaries/list (mirror of
 * BeneficiaryListQuerySchema).
 */
export const beneficiaryListQueryValidator: ValidationChain[] = [
    query("type")
        .optional()
        .isIn(Object.keys(USER_TYPE_MAP))
        .withMessage(localizedError("1100", 1100)),

    query("payment_rail").optional().isString(),

    query("status").optional().isString(),

    query("recipient_country")
        .optional()
        .isString()
        .isLength({ max: 3 })
        .withMessage(localizedError("1104", 1104)),

    query("recipient_currency")
        .optional()
        .isString()
        .isLength({ max: 3 })
        .withMessage(localizedError("1104", 1104)),

    query("search_key").optional().isString().isLength({ max: 128 }),

    query("skip").optional().isInt({ min: 0, max: 100_000 }).toInt(),

    query("take").optional().isInt({ min: 1 }).toInt(),
];
