import { Op } from "sequelize";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import {
    randomTokenBase64Url,
    safeEqual,
    sha256Hex,
} from "./crypto.helper";
import { endSession, startSession, touchSession } from "./session.helper";
import { TOKENABLE_TYPE_USER } from "../utils/constants";

/**
 * Opaque bearer tokens, format-compatible with the legacy /node
 * tokenService so tokens issued by either service authenticate on
 * both:
 *
 *   plaintext = "<rowId>|<base64url random>"
 *   token col = sha256(random + TOKEN_PEPPER)   (peppered, hex)
 *
 * Every authenticated request also touches the Redis session (sliding
 * inactivity TTL); a missing session means forced logout — identical
 * to the legacy behavior.
 *
 * Env: TOKEN_PEPPER (required), TOKEN_BYTES (default 40).
 */

export const TOKEN_NAME_INTERNAL = "internal-api-token";
export const TOKEN_NAME_EXTERNAL = "external-api-token";

const pepper = (): string => {
    const value = process.env.TOKEN_PEPPER;
    if (!value) {
        throw new Error("TOKEN_PEPPER is not set - required for token auth.");
    }
    return value;
};

export interface IssuedToken {
    plaintext: string;
    expiresAt: Date | null;
    expiresInSeconds: number | null;
}

export const issueToken = async (
    user: { id: number },
    abilities: string[] = ["authentication"],
    ttlSeconds: number | null = null,
    name: string = TOKEN_NAME_INTERNAL,
): Promise<IssuedToken> => {
    const tokenBytes = parseInt(process.env.TOKEN_BYTES || "40", 10);
    const random = randomTokenBase64Url(tokenBytes);
    const tokenHash = sha256Hex(random, pepper());
    const expiresAt =
        ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000) : null;

    const tokenRow = await PersonalAccessToken.create({
        tokenableType: TOKENABLE_TYPE_USER,
        tokenableId: user.id,
        name,
        token: tokenHash,
        abilities: JSON.stringify(abilities) as never,
        expiresAt,
    });

    const plaintext = `${tokenRow.id}|${random}`;
    await startSession(user.id, tokenRow.id, ttlSeconds);
    return { plaintext, expiresAt, expiresInSeconds: ttlSeconds };
};

export const authenticateToken = async (
    bearer: string,
): Promise<{ user: User; tokenId: number } | null> => {
    const separatorIndex = bearer.indexOf("|");
    if (separatorIndex <= 0) {
        return null;
    }
    const idPart = bearer.slice(0, separatorIndex);
    const random = bearer.slice(separatorIndex + 1);
    if (!/^\d+$/.test(idPart) || random.length === 0) {
        return null;
    }

    const tokenRow = await PersonalAccessToken.findByPk(Number(idPart));
    if (!tokenRow || tokenRow.tokenableType !== TOKENABLE_TYPE_USER) {
        return null;
    }

    const user = await User.findByPk(tokenRow.tokenableId);
    if (!user) {
        return null;
    }

    const expectedHash = sha256Hex(random, pepper());
    if (!safeEqual(tokenRow.token, expectedHash)) {
        return null;
    }

    if (tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now()) {
        return null;
    }

    // Inactivity check via Redis. Missing session = forced logout.
    const sessionAlive = await touchSession(user.id, tokenRow.id);
    if (!sessionAlive) {
        return null;
    }

    tokenRow.lastUsedAt = new Date();
    await tokenRow.save();

    return { user, tokenId: tokenRow.id };
};

export const revokeToken = async (
    tokenId: number,
    userId: number,
): Promise<void> => {
    await Promise.all([
        PersonalAccessToken.destroy({ where: { id: tokenId } }),
        endSession(userId, tokenId),
    ]);
};

/** Revokes every regular (internal) auth token for a user. */
export const revokeAllRegularTokensForUser = async (
    userId: number,
): Promise<void> => {
    const tokenRows = await PersonalAccessToken.findAll({
        where: {
            tokenableType: TOKENABLE_TYPE_USER,
            tokenableId: userId,
            name: { [Op.ne]: TOKEN_NAME_EXTERNAL },
        },
        attributes: ["id"],
    });
    await Promise.all([
        PersonalAccessToken.destroy({
            where: { id: { [Op.in]: tokenRows.map((row) => row.id) } },
        }),
        ...tokenRows.map((row) => endSession(userId, row.id)),
    ]);
};
