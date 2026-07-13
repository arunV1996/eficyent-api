import { body } from "express-validator";

export const registerValidator = [
    body("email")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1100"), code: 1100 }))
        .bail()
        .isEmail()
        .withMessage((_, { req }) => ({ msg: req.__("1101"), code: 1101 })),

    body("password")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1100"), code: 1100 })),
];

export const loginValidator = [
    body("email")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1100"), code: 1100 }))
        .bail()
        .isEmail()
        .withMessage((_, { req }) => ({ msg: req.__("1101"), code: 1101 })),

    body("password")
        .notEmpty()
        .withMessage((_, { req }) => ({ msg: req.__("1100"), code: 1100 })),
];
