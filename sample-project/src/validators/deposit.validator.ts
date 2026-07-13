import { body } from "express-validator";

export const depositValidator = [
    body("wallet_id")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1200"), code: 1200 }))
        .bail()
        .isInt()
        .withMessage((_, { req }) => ({ msg: req.__("1201"), code: 1201 })),

    body("amount")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1202"), code: 1202 }))
        .bail()
        .isFloat({ gt: 0 })
        .withMessage((_, { req }) => ({ msg: req.__("1203"), code: 1203 })),
];
