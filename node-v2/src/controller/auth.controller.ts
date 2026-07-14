import { Request, Response } from "express";
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
import User from "../models/user.model";
import { userToJSON } from "../resources/user.resource";
import {
    comparePassword,
    generateUniqueId,
    hashPassword,
} from "../utils/common.utils";
import {
    TOKEN_ABILITY_AUTHENTICATION,
    USER_TYPE_BUSINESS,
    USER_TYPE_PERSONAL,
} from "../utils/constants";

const MERCHANT_TYPE_PAYOUT = 1;
const MERCHANT_TYPE_PAYINCOLLECTION = 4;

/**
 * Shapes the login/tfa user object exactly as the legacy
 * LoginController does.
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
});

/**
 * POST /api/user/register
 */
export const register = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        const emailAddress = String(req.body.email).toLowerCase().trim();
        const plainPassword = String(req.body.password);

        const existingUser = await User.findOne({
            where: { email: emailAddress },
        });
        if (existingUser) {
            return res.sendError(res.__("1102"), 422, 422);
        }

        const hashedPassword = await hashPassword(plainPassword);
        const createdUser = await User.create({
            uniqueId: generateUniqueId(24),
            email: emailAddress,
            password: hashedPassword,
            mobileCountryCode: req.body.mobile_country_code ?? null,
            mobile: req.body.mobile ?? null,
            userType: Number(req.body.user_type) || USER_TYPE_PERSONAL,
        });

        // Send the verification OTP (writes email_code on the row).
        await UserAuthEmail.registered(createdUser);

        const responseUser = await User.findByPk(createdUser.id);
        return res.sendResponse(
            responseUser ? userToJSON(responseUser, req) : null,
            res.__("s101"),
            101,
        );
    } catch (error) {
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
        if (!user) {
            return res.sendError(res.__("125"), 125, 422);
        }

        const passwordMatches = await comparePassword(
            plainPassword,
            user.password,
        );
        if (!passwordMatches) {
            return res.sendError(res.__("125"), 125, 422);
        }

        // Persist device fields exactly as the legacy service did.
        await user.update({
            deviceType: req.body.device_type ?? null,
            deviceToken: req.body.device_id ?? null,
        });

        // X-Merchant-Id check (legacy LoginController.merchantHeader).
        const merchantHeader = req.header("x-merchant-id");
        if (user.merchantId && merchantHeader) {
            const merchant = await Merchant.findOne({
                where: { uniqueId: merchantHeader },
            });
            if (!merchant || merchant.uniqueId !== merchantHeader) {
                return res.sendError(res.__("151"), 151, 401);
            }
            if (
                merchant.type === MERCHANT_TYPE_PAYOUT ||
                merchant.type === MERCHANT_TYPE_PAYINCOLLECTION
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
                    res.__("s104"),
                    104,
                );
            }
        }

        if (user.isTfaEnabled) {
            // No token issued; client must follow up with /tfa-login.
            return res.sendResponse(
                { user: shapeLoginUser(user) },
                res.__("s104"),
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
            res.__("s104"),
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
            res.__("s104"),
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
            return res.sendError(res.__("401"), 401, 401);
        }
        await revokeToken(req.tokenId, req.user.id);
        await User.update(
            { privateKey: null, publicKey: null, deviceToken: null },
            { where: { id: req.user.id } },
        );
        return res.sendResponse({}, res.__("s105"), 105);
    } catch (error) {
        return res.handleError(error);
    }
};

/**
 * GET /api/user/get-credentials
 *
 * Returns the caller's api_key / salt_key / private_key (and the
 * merchant's, when the user belongs to one), generating or rotating
 * them as needed. The private key is what clients sign requests with;
 * the appSignature middleware verifies against the stored public key.
 */
export const getCredentials = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("401"), 401, 401);
        }

        let user = await User.unscoped().findByPk(req.user.id);
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
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

        if (user.merchantId) {
            let merchant = await Merchant.unscoped().findByPk(
                user.merchantId,
            );
            if (merchant) {
                if (
                    !merchant.apiKey ||
                    !merchant.saltKey ||
                    !merchant.privateKey
                ) {
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

                dataPayload.merchant = {
                    unique_id: merchant.uniqueId ?? null,
                    api_key: merchant.apiKey ?? null,
                    salt_key: merchant.saltKey
                        ? await decryptEnvelope(merchant.saltKey)
                        : null,
                    private_key: merchantPrivateKey,
                };
            }
        }

        return res.sendEmptyEnvelope(dataPayload, "");
    } catch (error) {
        return res.handleError(error);
    }
};
