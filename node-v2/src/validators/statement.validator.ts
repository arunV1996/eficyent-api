import { query, ValidationChain } from "express-validator";

/**
 * express-validator chain for GET /statement/export — mirror of the
 * legacy StatementExportSchema (strict YYYY-MM-DD dates, required
 * bank_account_id).
 */

const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: { req: unknown }) => {
        const request = meta.req as { __?: (key: string) => string };
        const message = request.__ ? request.__(localeKey) : localeKey;
        return { msg: message, code };
    };
};

export const statementExportQueryValidator: ValidationChain[] = [
    query("from_date")
        .optional()
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage(() => ({ msg: "Invalid date format", code: 422 })),

    query("to_date")
        .optional()
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage(() => ({ msg: "Invalid date format", code: 422 })),

    query("bank_account_id")
        .notEmpty()
        .withMessage(localizedError("1100", 1100))
        .bail()
        .isString(),
];
