import { body } from "express-validator";

export const withdrawValidator = [
    body("wallet_id")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1300"), code: 1300 }))
        .bail()
        .isInt()
        .withMessage((_, { req }) => ({ msg: req.__("1301"), code: 1301 })),

    body("amount")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1302"), code: 1302 }))
        .bail()
        .isFloat({ gt: 0 })
        .withMessage((_, { req }) => ({ msg: req.__("1303"), code: 1303 })),
];
