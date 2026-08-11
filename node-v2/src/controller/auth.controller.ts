import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { decryptEnvelope, encryptEnvelope } from "../helpers/crypto.helper";
import {
    generateAndStoreCredentials,
    rotateRsaKeys,
} from "../helpers/credential.helper";
import { UserAuthEmail } from "../helpers/user_auth_email.helper";
import {
    issueToken,
    revokeAllRegularTokensForUser,
    revokeToken,
} from "../helpers/token.helper";
import { checkBackupCode, verifyTotp } from "../helpers/totp.helper";
import Merchant from "../models/merchant.model";
import MerchantSetting from "../models/merchant_setting.model";
import User from "../models/user.model";
import UserInformation from "../models/user_information.model";
import {
    comparePassword,
    generateEmailCodeExpiry,
    generateUniqueId,
    hashPassword,
    roleLabel,
    verifyAndUpgradePassword,
} from "../utils/common.utils";
import { generateEmailCode } from "../helpers/user_auth_email.helper";
import { CodedError } from "../helpers/coded_error.helper";
import {
    MERCHANT_TYPE_PAYINCOLLECTION,
    MERCHANT_TYPE_PAYOUT,
    MERCHANT_TYPE_PAYOUTINTEGRATOR,
    MERCHANT_TYPE_WHITELABEL,
    SUPPORTED_USER_BUSINESS,
    SUPPORTED_USER_INDIVIDUAL,
    TOKEN_ABILITY_AUTHENTICATION,
    USER_TYPE_BUSINESS,
    USER_TYPE_PENDING,
} from "../utils/constants";

/**
 * Shapes the login/tfa user object exactly as the legacy
 * LoginController does (includes the resolved role label).
 */
const shapeLoginUser = (user: User): Record<string, unknown> => ({
    unique_id: user.uniqueId,
    email: user.email,
    mobile_country_code: user.mobileCountryCode ?? "",
    mobile: user.mobile ?? "",
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
    user_type:
        Number(user.userType) === USER_TYPE_BUSINESS ? "BUSINESS" : "PERSONAL",
    is_tfa_setup_completed: user.isTfaSetupCompleted ? "YES" : "NO",
    is_tfa_enabled: user.isTfaEnabled ? "YES" : "NO",
    role: roleLabel(user.userRole),
});

/**
 * A VALID bcrypt hash of a throwaway value. Verifying against it when
 * no user is found keeps login timing constant, preventing account
 * enumeration. Must be a well-formed hash so bcrypt does the full work
 * rather than bailing early on a malformed string.
 */
const DUMMY_BCRYPT_HASH =
    "$2b$10$IPZqH0e./YLGtX60HTlA2uddZW8iX.IB0rvJl5/Ywrb5uu0/UWXP.";

/**
 * Whether the merchant supports the given user type per its
 * supported_user_types setting. Mirror of isSupportedUserType.
 */
const isSupportedUserType = async (
    userType: number,
    merchantId: number,
    transaction: import("sequelize").Transaction,
): Promise<boolean> => {
    const setting = await MerchantSetting.findOne({
        where: { merchantId, key: "supported_user_types" },
        transaction,
    });
    if (!setting?.value) {
        return true;
    }
    if (
        setting.value === SUPPORTED_USER_BUSINESS &&
        userType !== USER_TYPE_BUSINESS
    ) {
        return false;
    }
    if (
        setting.value === SUPPORTED_USER_INDIVIDUAL &&
        userType !== USER_TYPE_PENDING
    ) {
        return false;
    }
    return true;
};

/**
 * POST /api/user/register
 *
 * Full parity with the legacy RegisterController: one transaction,
 * email+mobile uniqueness (field-specific 422), X-Merchant-Id email
 * verification flow, optional user_information, eager credential
 * generation, and the register-specific response shape (role ADMIN,
 * no TFA flags).
 */
export const register = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const plainPassword = String(req.body.password);
        const mobile = req.body.mobile ? String(req.body.mobile) : null;

        // The validator admits only the BUSINESS / PERSONAL string
        // enum; PERSONAL registrations are not supported.
        let requestedUserType = USER_TYPE_PENDING;
        if (req.body.user_type !== undefined) {
            if (req.body.user_type === "PERSONAL") {
                return res.sendError(
                    "Selected user type is not supported.",
                    205,
                    422,
                );
            }
            requestedUserType = USER_TYPE_BUSINESS;
        }
        const merchantHeader = req.header("x-merchant-id");

        const passwordHash = await hashPassword(plainPassword);

        const user = await sequelize.transaction(async (databaseTransaction) => {
            // Uniqueness across email + mobile (field-specific errors).
            const existing = await User.unscoped().findOne({
                where: {
                    [Op.or]: [
                        { email: emailAddress },
                        ...(mobile ? [{ mobile }] : []),
                    ],
                },
                transaction: databaseTransaction,
            });
            if (existing) {
                const fieldErrors: Record<string, string[]> = {};
                if (existing.email === emailAddress) {
                    fieldErrors.email = ["The email has already been taken."];
                }
                if (mobile && existing.mobile === mobile) {
                    fieldErrors.mobile = ["The mobile has already been taken."];
                }
                if (Object.keys(fieldErrors).length > 0) {
                    // First field error carries the message; 422 status.
                    const firstKey = Object.keys(fieldErrors)[0];
                    throw new CodedError(fieldErrors[firstKey][0], 422, 422);
                }
            }

            let sendEmail = !merchantHeader;
            let merchantRowId: number | null = null;

            if (merchantHeader) {
                const merchant = await Merchant.findOne({
                    where: { uniqueId: merchantHeader },
                    transaction: databaseTransaction,
                });
                if (merchant) {
                    merchantRowId = merchant.id;
                    if (merchant.type === MERCHANT_TYPE_WHITELABEL) {
                        sendEmail = true;
                    }
                    if (
                        merchant.type === MERCHANT_TYPE_PAYINCOLLECTION ||
                        merchant.type === MERCHANT_TYPE_PAYOUTINTEGRATOR
                    ) {
                        const supported = await isSupportedUserType(
                            requestedUserType,
                            merchant.id,
                            databaseTransaction,
                        );
                        if (!supported) {
                            throw new CodedError(
                                "User type not supported by merchant.",
                                194,
                                400,
                            );
                        }
                        sendEmail = false;
                    }
                }
            }

            const createdUser = await User.create(
                {
                    uniqueId: generateUniqueId(24),
                    merchantId: merchantRowId,
                    title: req.body.title ?? null,
                    firstName: req.body.first_name ?? null,
                    middleName: req.body.middle_name ?? null,
                    lastName: req.body.last_name ?? null,
                    email: emailAddress,
                    mobileCountryCode: req.body.mobile_country_code ?? null,
                    mobile,
                    password: passwordHash,
                    userType: requestedUserType,
                    timezone: req.body.timezone ?? "Asia/Kolkata",
                    emailCode: sendEmail ? generateEmailCode() : null,
                    emailCodeExpiry: sendEmail
                        ? generateEmailCodeExpiry(10)
                        : null,
                    emailVerifiedAt: sendEmail ? null : new Date(),
                },
                { transaction: databaseTransaction },
            );

            if (req.body.country) {
                await UserInformation.create(
                    {
                        uniqueId: generateUniqueId(24),
                        userId: createdUser.id,
                        country: String(req.body.country),
                    } as never,
                    { transaction: databaseTransaction },
                );
            }

            await generateAndStoreCredentials(createdUser.id, "user", {
                transaction: databaseTransaction,
            });

            return createdUser;
        });

        if (!user.emailVerifiedAt) {
            await UserAuthEmail.registered(user);
        }

        return res.sendResponse(
            {
                user: {
                    unique_id: user.uniqueId,
                    email: user.email,
                    mobile_country_code: user.mobileCountryCode,
                    mobile: user.mobile,
                    email_status: user.emailVerifiedAt
                        ? "VERIFIED"
                        : "NOT_VERIFIED",
                    user_type:
                        Number(user.userType) === USER_TYPE_BUSINESS
                            ? "BUSINESS"
                            : "PERSONAL",
                    role: "ADMIN",
                },
            },
            res.__("success.101"),
            101,
        );
    } catch (error) {
        if (error instanceof CodedError) {
            return res.sendError(
                error.message,
                error.errorCode,
                error.httpStatus,
            );
        }
        return res.handleError(error);
    }
};

/**
 * POST /api/user/login
 *
 * Verifies email + password. Honors the X-Merchant-Id header for
 * integrator merchants (short-lived token), gates TFA-enabled users
 * (no token until /tfa-login), and otherwise issues a fresh access
 * token after revoking prior ones.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const plainPassword = String(req.body.password);

        const user = await User.scope("withPassword").findOne({
            where: { email: emailAddress },
        });

        // Constant-time path: always run a verify even when the user is
        // missing, so response timing can't be used to enumerate
        // accounts. verifyAndUpgrade also surfaces a rehash when the
        // hashing config is upgraded.
        const verification = user
            ? await verifyAndUpgradePassword(user.password, plainPassword)
            : ((await comparePassword(plainPassword, DUMMY_BCRYPT_HASH)) &&
                  false) ||
              { valid: false as boolean };

        if (!user || !verification.valid) {
            return res.sendError(res.__("125"), 125, 422);
        }

        // Persist an upgraded hash if the verifier produced one.
        if (verification.rehash) {
            await user.update({ password: verification.rehash });
        }

        // Persist device fields exactly as the legacy service did.
        await user.update({
            deviceType: req.body.device_type ?? null,
            deviceToken: req.body.device_id ?? null,
        });

        // X-Merchant-Id check against the user's own parent merchant
        // (merchant_id) — a header naming any other merchant is
        // unauthorized, closing the hole where a foreign merchant id
        // passed validation because only header existence was checked.
        const merchantHeader = req.header("x-merchant-id");
        const parentMerchant = await user.loadParentMerchant();
        if (parentMerchant && merchantHeader) {
            if (parentMerchant.uniqueId !== merchantHeader) {
                return res.sendError(res.__("151"), 151, 401);
            }
            if (
                parentMerchant.type === MERCHANT_TYPE_PAYOUT ||
                parentMerchant.type === MERCHANT_TYPE_PAYINCOLLECTION
            ) {
                const ttlSeconds = 30 * 60;
                const issued = await issueToken(
                    user,
                    [TOKEN_ABILITY_AUTHENTICATION],
                    ttlSeconds,
                );
                return res.sendResponse(
                    {
                        access_token: issued.plaintext,
                        expires_at: issued.expiresAt?.toISOString(),
                        expires_in: ttlSeconds,
                    },
                    res.__("success.104"),
                    104,
                );
            }
        }

        if (user.isTfaEnabled) {
            // No token issued; client must follow up with /tfa-login.
            return res.sendResponse(
                { user: shapeLoginUser(user) },
                res.__("success.104"),
                104,
            );
        }

        await revokeAllRegularTokensForUser(user.id);
        const issued = await issueToken(
            user,
            [TOKEN_ABILITY_AUTHENTICATION],
            null,
        );
        return res.sendResponse(
            { user: shapeLoginUser(user), access_token: issued.plaintext },
            res.__("success.104"),
            104,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/tfa-login
 *
 * Second factor: TOTP code or a backup code. On backup-code success
 * the used code is consumed and the remaining set re-encrypted.
 */
export const tfaLogin = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const verificationCode = String(req.body.verification_code);

        const user = await User.unscoped().findOne({
            where: { email: emailAddress },
        });
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!user.isTfaEnabled) {
            return res.sendError(res.__("140"), 140, 400);
        }

        let verified = await verifyTotp(
            user.tfaSecret ?? "",
            verificationCode,
        );

        if (!verified && user.backupCodes) {
            let plaintextCodes = user.backupCodes;
            if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
                try {
                    plaintextCodes = await decryptEnvelope(plaintextCodes);
                } catch {
                    // Leave as-is; the check below simply won't match.
                }
            }
            const backupCheck = checkBackupCode(
                plaintextCodes,
                verificationCode,
            );
            if (backupCheck.ok) {
                verified = true;
                const encryptedRemaining = backupCheck.remaining
                    ? await encryptEnvelope(backupCheck.remaining)
                    : null;
                await user.update({ backupCodes: encryptedRemaining });
            }
        }

        if (!verified) {
            return res.sendError(res.__("139"), 139, 400);
        }

        await revokeAllRegularTokensForUser(user.id);
        const issued = await issueToken(
            user,
            [TOKEN_ABILITY_AUTHENTICATION],
            null,
        );
        return res.sendResponse(
            { user: shapeLoginUser(user), access_token: issued.plaintext },
            res.__("success.104"),
            104,
        );
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * POST /api/user/logout
 */
export const logout = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user || !req.tokenId) {
            return res.sendError(res.__("102"), 102, 400);
        }
        await revokeToken(req.tokenId, req.user.id);
        await User.update(
            { privateKey: null, publicKey: null, deviceToken: null },
            { where: { id: req.user.id } },
        );
        return res.sendResponse({}, res.__("success.105"), 105);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * Ensures the merchant carries a decryptable credential set
 * (generating a fresh one when missing or undecryptable) and returns
 * it in the METHOD_GET_CREDENTIALS resource shape.
 */
const merchantCredentialsPayload = async (
    merchantRow: Merchant,
): Promise<Record<string, unknown>> => {
    let merchant = merchantRow;
    if (!merchant.apiKey || !merchant.saltKey || !merchant.privateKey) {
        merchant = (await generateAndStoreCredentials(
            merchant.id,
            "merchant",
        )) as Merchant;
    }

    let merchantPrivateKey: string;
    try {
        merchantPrivateKey = await decryptEnvelope(
            merchant.privateKey as string,
        );
        if (merchant.saltKey) {
            await decryptEnvelope(merchant.saltKey);
        }
    } catch {
        merchant = (await generateAndStoreCredentials(
            merchant.id,
            "merchant",
        )) as Merchant;
        merchantPrivateKey = await decryptEnvelope(
            merchant.privateKey as string,
        );
    }

    return {
        unique_id: merchant.uniqueId ?? null,
        api_key: merchant.apiKey ?? null,
        salt_key: merchant.saltKey
            ? await decryptEnvelope(merchant.saltKey)
            : null,
        private_key: merchantPrivateKey,
    };
};

/**
 * GET /api/user/get-credentials
 *
 * Returns the caller's api_key / salt_key / private_key, rotating the
 * RSA pair on every call. The private key is what clients sign
 * requests with; the appSignature middleware verifies against the
 * stored public key.
 *
 * Merchant resolution (mirror of the PHP get_credentials refactor):
 * a caller under a NON-whitelabel parent merchant presenting the
 * X-Merchant-Id header IS the merchant principal — its credentials
 * come back as `user` and the user's own keys are left untouched.
 * Otherwise the user's rotated credentials come back as `user`, with
 * the parent merchant's attached as `merchant` when the parent is not
 * a whitelabel.
 */
export const getCredentials = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        let user = await User.unscoped().findByPk(req.user.id);
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        // unscoped: the credential columns are hidden by the default
        // scope, so loadParentMerchant() can't serve this path.
        const merchantHeader = req.header("x-merchant-id");
        const parentMerchant = user.merchantId
            ? await Merchant.unscoped().findByPk(user.merchantId)
            : null;

        if (
            parentMerchant &&
            merchantHeader &&
            parentMerchant.type !== MERCHANT_TYPE_WHITELABEL
        ) {
            return res.sendEmptyEnvelope(
                { user: await merchantCredentialsPayload(parentMerchant) },
                "",
            );
        }

        if (!user.apiKey || !user.saltKey || !user.privateKey) {
            user = (await generateAndStoreCredentials(
                user.id,
                "user",
            )) as User;
        } else {
            user = (await rotateRsaKeys(user.id, "user")) as User;
        }

        let privateKey: string;
        try {
            privateKey = await decryptEnvelope(user.privateKey as string);
            if (user.saltKey) {
                await decryptEnvelope(user.saltKey);
            }
        } catch {
            user = (await generateAndStoreCredentials(
                user.id,
                "user",
            )) as User;
            privateKey = await decryptEnvelope(user.privateKey as string);
        }

        const dataPayload: Record<string, unknown> = {
            user: {
                unique_id: user.uniqueId,
                api_key: user.apiKey,
                salt_key: user.saltKey
                    ? await decryptEnvelope(user.saltKey)
                    : null,
                private_key: privateKey,
            },
        };

        if (
            parentMerchant &&
            parentMerchant.type !== MERCHANT_TYPE_WHITELABEL
        ) {
            dataPayload.merchant =
                await merchantCredentialsPayload(parentMerchant);
        }

        return res.sendEmptyEnvelope(dataPayload, "");
    } catch (error) {
        return res.handleError(error);
    }
};
