import { Request, Response } from "express";
import { Op } from "sequelize";
import sequelize from "../config/database";
import { CodedError } from "../helpers/coded_error.helper";
import { decryptEnvelope, encryptEnvelope } from "../helpers/crypto.helper";
import { settingGet } from "../helpers/setting.helper";
import { issueToken } from "../helpers/token.helper";
import {
    generateEmailCode,
    UserAuthEmail,
} from "../helpers/user_auth_email.helper";
import User from "../models/user.model";
import { subUserToJSON } from "../resources/user.resource";
import {
    generateEmailCodeExpiry,
    generateUniqueId,
    hashPassword,
} from "../utils/common.utils";
import { TAKE_COUNT, USER_TYPE_PERSONAL } from "../utils/constants";

/**
 * Mirror of Api\SubuserController (via the legacy subuserController).
 * Subusers are User rows pointing at a business user via
 * business_user_id.
 *
 * Invite token payload (opaque to the client, round-tripped as-is):
 *   { email: <subuser_email>, expires_at: <unix_seconds> }
 * The envelope uses the Laravel AES app-key cipher (crypto.helper) —
 * the legacy service encrypts with its own configured envelope, so
 * invites are accepted by the service that issued them.
 */

const sendCodedError = (res: Response, error: unknown): void => {
    if (error instanceof CodedError) {
        return res.sendError(error.message, error.errorCode, error.httpStatus);
    }
    return res.handleError(error);
};

const shapeVerifyUser = (user: User): Record<string, unknown> => ({
    unique_id: user.uniqueId,
    email: user.email,
    email_status: user.emailVerifiedAt ? "VERIFIED" : "NOT_VERIFIED",
});

interface InvitePayload {
    email: string;
    expires_at: number;
}

/**
 * GET /api/user/subusers/list
 */
export const index = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const search = (req.query.search_key as string | undefined)?.trim();
        const skip = Number((req.query.skip as string) ?? 0);
        const take = Number((req.query.take as string) ?? TAKE_COUNT);

        const where: Record<string | symbol, unknown> = {
            businessUserId: req.user.id,
        };
        if (search) {
            const searchTerm = `%${search}%`;
            where[Op.or] = [
                { email: { [Op.like]: searchTerm } },
                { uniqueId: { [Op.like]: searchTerm } },
                { firstName: { [Op.like]: searchTerm } },
                { lastName: { [Op.like]: searchTerm } },
                { mobile: { [Op.like]: searchTerm } },
            ];
        }
        const [total, rows] = await Promise.all([
            User.unscoped().count({ where }),
            User.unscoped().findAll({
                where,
                order: [["id", "DESC"]],
                offset: skip,
                limit: take,
            }),
        ]);
        return res.sendResponse(
            { total, subusers: rows.map(subUserToJSON) },
            "",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/subusers/store — creates the subuser row with an
 * unusable password and emails the encrypted invite link.
 */
export const store = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const body = req.body as Record<string, string | undefined>;
        const businessUser = req.user;

        let subuser: User;
        try {
            subuser = await sequelize.transaction(
                async (databaseTransaction) => {
                    const existsByEmail = await User.unscoped().findOne({
                        where: { email: body.email },
                        transaction: databaseTransaction,
                    });
                    if (existsByEmail) {
                        throw new CodedError(
                            "The email has already been taken.",
                            422,
                            422,
                        );
                    }
                    const existsByMobile = await User.unscoped().findOne({
                        where: { mobile: body.mobile },
                        transaction: databaseTransaction,
                    });
                    if (existsByMobile) {
                        throw new CodedError(
                            "The mobile number has already been taken.",
                            422,
                            422,
                        );
                    }

                    return User.create(
                        {
                            uniqueId: generateUniqueId(24),
                            businessUserId: businessUser.id,
                            userType: USER_TYPE_PERSONAL,
                            // Unusable hash so nobody can log in during
                            // the create -> accept-invite window.
                            password: await hashPassword(
                                `!unset:${generateUniqueId(32)}`,
                            ),
                            title: body.title,
                            firstName: body.first_name,
                            middleName: body.middle_name ?? null,
                            lastName: body.last_name ?? null,
                            email: body.email!,
                            mobileCountryCode: body.mobile_country_code,
                            mobile: body.mobile,
                            emailCode: generateEmailCode(),
                            emailCodeExpiry: generateEmailCodeExpiry(60),
                        },
                        { transaction: databaseTransaction },
                    );
                },
            );
        } catch (transactionError) {
            if (transactionError instanceof CodedError) {
                return res.sendError(
                    transactionError.message,
                    transactionError.errorCode,
                    transactionError.httpStatus,
                );
            }
            throw transactionError;
        }

        const linkExpiryMinutes = Number(
            await settingGet<string>("invite_link_expiry", "60"),
        );
        const expiresAt =
            Math.floor(Date.now() / 1000) + linkExpiryMinutes * 60;
        const invitePayload: InvitePayload = {
            email: subuser.email,
            expires_at: expiresAt,
        };
        const tokenEnvelope = await encryptEnvelope(
            JSON.stringify(invitePayload),
        );

        await UserAuthEmail.userInviteLink(subuser, tokenEnvelope);

        return res.sendResponse(
            { subuser: subUserToJSON(subuser) },
            "Subuser created successfully.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * GET /api/user/subusers/show
 */
export const show = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const subuser = await User.unscoped().findOne({
            where: {
                uniqueId: String(req.query.subuser_id),
                businessUserId: req.user.id,
            },
        });
        if (!subuser) {
            return res.sendError("Subuser not found.", 136, 400);
        }
        return res.sendResponse(
            { subuser: subUserToJSON(subuser) },
            "Subuser fetched successfully.",
            200,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * DELETE /api/user/subusers/delete — detaches the subuser from the
 * business account (business_user_id is nulled; the row remains).
 */
export const destroy = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        const subuser = await User.unscoped().findOne({
            where: {
                uniqueId: String(req.query.subuser_id),
                businessUserId: req.user.id,
            },
        });
        if (!subuser) {
            return res.sendError("Subuser not found.", 136, 400);
        }
        await User.update(
            { businessUserId: null },
            { where: { id: subuser.id } },
        );
        return res.sendResponse([], "Account deleted successfully.", 200);
    } catch (error) {
        return sendCodedError(res, error);
    }
};

/**
 * POST /api/user/subusers/accept-invite — public. Decrypts the invite
 * envelope, verifies expiry, sets the password, marks the email
 * verified and issues a session token (same envelope as verify-otp).
 */
export const acceptInvite = async (
    req: Request,
    res: Response,
): Promise<void> => {
    try {
        let payload: InvitePayload;
        try {
            payload = JSON.parse(
                await decryptEnvelope(String(req.body.invite_token)),
            ) as InvitePayload;
        } catch {
            return res.sendError("Invalid invite token.", 144, 400);
        }
        if (!payload.email) {
            return res.sendError("Invalid invite token.", 144, 400);
        }
        if (
            !payload.expires_at ||
            Math.floor(Date.now() / 1000) > payload.expires_at
        ) {
            return res.sendError("Invite link expired.", 145, 400);
        }
        const user = await User.unscoped().findOne({
            where: { email: payload.email },
        });
        if (!user) {
            return res.sendError(res.__("102"), 102, 400);
        }
        if (!user.emailCode) {
            return res.sendError("Invite already accepted.", 146, 400);
        }

        await user.update({
            emailCode: null,
            emailCodeExpiry: null,
            emailVerifiedAt: new Date(),
            password: await hashPassword(String(req.body.password)),
        });

        const issued = await issueToken(user, ["authentication"], null);
        await UserAuthEmail.emailVerified(user);

        return res.sendResponse(
            {
                user: shapeVerifyUser(user),
                access_token: issued.plaintext,
            },
            res.__("s102"),
            102,
        );
    } catch (error) {
        return sendCodedError(res, error);
    }
};
