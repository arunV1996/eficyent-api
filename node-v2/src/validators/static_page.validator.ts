import { query, ValidationChain } from "express-validator";
import { localizedError } from "./validation_message.helper";

/**
 * express-validator chain for GET /static-pages/show — mirror of the
 * legacy StaticPageShowSchema (either `type` or
 * `static_page_unique_id` is required; both are additive filters).
 */


export const staticPageShowQueryValidator: ValidationChain[] = [
    query("type")
        .optional()
        .isString()
        .isLength({ min: 1, max: 50 })
        .withMessage(localizedError("1100", 1100)),

    query("static_page_unique_id")
        .optional()
        .isString()
        .isLength({ min: 1, max: 64 })
        .withMessage(localizedError("1100", 1100)),

    query("type").custom((_value, { req }) => {
        const requestQuery = (req.query ?? {}) as Record<string, unknown>;
        return Boolean(
            requestQuery.type ?? requestQuery.static_page_unique_id,
        );
    }).withMessage(() => ({
        msg: "Either `type` or `static_page_unique_id` is required.",
        code: 422,
    })),
];
