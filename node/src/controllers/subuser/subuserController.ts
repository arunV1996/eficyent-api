import { Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { sendResponse } from "../../helpers/response";
import { ApiException } from "../../helpers/errors";
import { apiSuccess } from "../../helpers/messages";
import { encryptEnvelope, decryptEnvelope } from "../../config/kms";
import { passwordService } from "../../services/auth/passwordService";
import { tokenService } from "../../services/auth/tokenService";
import { UserAuthEmailService, UserEmailService } from "../../services/email/userAuthEmailService";
import { generateEmailCode, uniqueId } from "../../helpers/uniqueId";
import { generateEmailCodeExpiry } from "../../helpers/lookups";
import { settingGet } from "../../services/settings/settingsService";
import {
  METHOD_VERIFY_EMAIL,
  TAKE_COUNT,
  USER_TYPE_INDIVIDUAL,
} from "../../helpers/constants";
import { subUserResource, userResource } from "../../services/auth/userResource";
import {
  AcceptInviteInput,
  SubUserShowInput,
  SubUserStoreInput,
} from "../../validators/subuser/subuserValidators";

/**
 * Mirror of Api\\SubuserController. Subusers are User rows that point at a
 * business user via `business_user_id`. The accept-invite flow uses a
 * KMS-encrypted token rather than Laravel's Crypt::encrypt so we get the
 * full audit trail through CloudTrail.
 *
 * Invite token payload:
 *   { email: <subuser_email>, expires_at: <unix_seconds> }
 *
 * The token is opaque to the client - they round-trip the string.
 */

interface InvitePayload {
  email: string;
  expires_at: number;
}

export const subuserController = {
  async index(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const search = (req.query.search_key as string | undefined)?.trim();
    const skip = Number((req.query.skip as string) ?? 0);
    const take = Number((req.query.take as string) ?? TAKE_COUNT);

    const where = {
      businessUserId: req.user.id,
      ...(search
        ? {
            OR: [
              { email: { contains: search } },
              { uniqueId: { contains: search } },
              { firstName: { contains: search } },
              { lastName: { contains: search } },
              { mobile: { contains: search } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma().user.count({ where }),
      prisma().user.findMany({
        where,
        orderBy: { id: "desc" },
        skip,
        take,
      }),
    ]);
    return sendResponse(res, "", 200, {
      total,
      subusers: rows.map(subUserResource),
    });
  },

  async store(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const body = req.body as SubUserStoreInput;
    const businessUser = req.user;

    // Mobile uniqueness is enforced by the User.mobile @unique constraint;
    // surface a clean error if the insert fails.
    const subuser = await prisma().$transaction(async (tx) => {
      const existsByEmail = await tx.user.findUnique({
        where: { email: body.email },
      });
      if (existsByEmail) {
        throw new ApiException(422, "The email has already been taken.", 422);
      }
      const existsByMobile = await tx.user.findUnique({
        where: { mobile: body.mobile },
      });
      if (existsByMobile) {
        throw new ApiException(422, "The mobile number has already been taken.", 422);
      }

      return tx.user.create({
        data: {
          uniqueId: uniqueId(24),
          businessUserId: businessUser.id,
          userType: USER_TYPE_INDIVIDUAL,
          // Subuser cannot log in until they accept the invite + set their
          // password. We set an unusable hash so nobody can guess in the
          // window between create and accept-invite.
          password: await passwordService.hash(`!unset:${uniqueId(32)}`),
          title: body.title,
          firstName: body.first_name,
          middleName: body.middle_name ?? null,
          lastName: body.last_name ?? null,
          email: body.email,
          mobileCountryCode: body.mobile_country_code,
          mobile: body.mobile,
          emailCode: generateEmailCode(),
          emailCodeExpiry: generateEmailCodeExpiry(60),
        },
      });
    });

    const linkExpiryMin = Number(await settingGet<string>("invite_link_expiry", "60"));
    const expiresAt = Math.floor(Date.now() / 1000) + linkExpiryMin * 60;
    const tokenEnvelope = await encryptEnvelope(
      JSON.stringify({ email: subuser.email, expires_at: expiresAt } satisfies InvitePayload),
    );

    await UserEmailService.userInviteLink(subuser, tokenEnvelope);

    return sendResponse(res, "Subuser created successfully.", 200, {
      subuser: subUserResource(subuser),
    });
  },

  async show(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SubUserShowInput;
    const subuser = await prisma().user.findFirst({
      where: { uniqueId: q.subuser_id, businessUserId: req.user.id },
    });
    if (!subuser) throw new ApiException(136);
    return sendResponse(res, "Subuser fetched successfully.", 200, {
      subuser: subUserResource(subuser),
    });
  },

  async destroy(req: Request, res: Response): Promise<Response> {
    if (!req.user) throw new ApiException(102);
    const q = req.query as unknown as SubUserShowInput;
    const subuser = await prisma().user.findFirst({
      where: { uniqueId: q.subuser_id, businessUserId: req.user.id },
    });
    if (!subuser) throw new ApiException(136);
    await prisma().user.update({
      where: { id: subuser.id },
      data: { businessUserId: null },
    });
    return sendResponse(res, "Account deleted successfully.", 200, []);
  },

  async acceptInvite(req: Request, res: Response): Promise<Response> {
    const body = req.body as AcceptInviteInput;
    let payload: InvitePayload;
    try {
      payload = JSON.parse(await decryptEnvelope(body.invite_token)) as InvitePayload;
    } catch {
      throw new ApiException(144);
    }
    if (!payload.email) throw new ApiException(144);
    if (!payload.expires_at || Math.floor(Date.now() / 1000) > payload.expires_at) {
      throw new ApiException(145);
    }
    const user = await prisma().user.findUnique({ where: { email: payload.email } });
    if (!user) throw new ApiException(102);
    if (!user.emailCode) throw new ApiException(146);

    const updated = await prisma().user.update({
      where: { id: user.id },
      data: {
        emailCode: null,
        emailCodeExpiry: null,
        emailVerifiedAt: new Date(),
        password: await passwordService.hash(body.password),
      },
    });

    const issued = await tokenService.issue(updated, ["authentication"], null);
    await UserAuthEmailService.emailVerified(updated);

    return sendResponse(res, apiSuccess(102), 102, {
      user: userResource(updated, METHOD_VERIFY_EMAIL),
      access_token: issued.plaintext,
    });
  },
};
