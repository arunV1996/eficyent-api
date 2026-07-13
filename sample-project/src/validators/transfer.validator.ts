import { body } from "express-validator";

export const transferValidator = [
    body("sender_wallet_id")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1400"), code: 1400 }))
        .bail()
        .isInt()
        .withMessage((_, { req }) => ({ msg: req.__("1401"), code: 1401 })),

    body("receiver_wallet_id")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1402"), code: 1402 }))
        .bail()
        .isInt()
        .withMessage((_, { req }) => ({ msg: req.__("1403"), code: 1403 })),

    body("amount")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1407"), code: 1407 }))
        .bail()
        .isFloat({ gt: 0 })
        .withMessage((_, { req }) => ({ msg: req.__("1408"), code: 1408 })),
];
