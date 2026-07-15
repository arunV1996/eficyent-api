import PersonalAccessToken from "../models/personal_access_token.model";
import TeamMember from "../models/team_member.model";
import {
    randomTokenBase64Url,
    safeEqual,
    sha256Hex,
} from "./crypto.helper";
import { endSession, startSession, touchSession } from "./session.helper";
import {
    TEAM_MEMBER_DISABLED,
    TEAM_MEMBER_INACTIVE,
    TOKENABLE_TEAM_MEMBER,
} from "../utils/constants";

/**
 * Team-member opaque token issuance/verification (mirror of the legacy
 * teamTokenService). The personal_access_tokens table is shared with
 * the user-side flow and scoped by tokenable_type.
 *
 * Sessions reuse the sess:{scope}:{tokenId} Redis key family with the
 * member id NEGATED — negative ids aren't used by user sessions, so the
 * two namespaces can never collide (same trick as legacy).
 */

const TOKEN_NAME_TEAM = "team_member_token";

const pepper = (): string => process.env.TOKEN_PEPPER ?? "";

/** Disjoint Redis session scope for team members. */
const toScope = (memberId: number): number => -memberId;

export interface IssuedTeamToken {
    plaintext: string;
    expiresAt: Date | null;
}

export const issueTeamToken = async (
    member: { id: number },
    ttlSeconds: number | null = null,
    abilities: string[] = ["authentication"],
    name: string = TOKEN_NAME_TEAM,
): Promise<IssuedTeamToken> => {
    const tokenBytes = parseInt(process.env.TOKEN_BYTES || "40", 10);
    const random = randomTokenBase64Url(tokenBytes);
    const tokenHash = sha256Hex(random, pepper());
    const expiresAt =
        ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000) : null;

    const tokenRow = await PersonalAccessToken.create({
        tokenableType: TOKENABLE_TEAM_MEMBER,
        tokenableId: member.id,
        name,
        token: tokenHash,
        abilities: JSON.stringify(abilities) as never,
        expiresAt,
    });

    const plaintext = `${tokenRow.id}|${random}`;
    await startSession(toScope(member.id), tokenRow.id, ttlSeconds);
    return { plaintext, expiresAt };
};

export const authenticateTeamToken = async (
    bearer: string,
): Promise<{ member: TeamMember; tokenId: number } | null> => {
    const separatorIndex = bearer.indexOf("|");
    if (separatorIndex <= 0) {
        return null;
    }
    const idPart = bearer.slice(0, separatorIndex);
    const random = bearer.slice(separatorIndex + 1);
    if (!/^\d+$/.test(idPart) || random.length === 0) {
        return null;
    }
    const tokenId = Number(idPart);

    const tokenRow = await PersonalAccessToken.findByPk(tokenId);
    if (!tokenRow || tokenRow.tokenableType !== TOKENABLE_TEAM_MEMBER) {
        return null;
    }

    const expectedHash = sha256Hex(random, pepper());
    if (!safeEqual(tokenRow.token, expectedHash)) {
        return null;
    }
    if (tokenRow.expiresAt && tokenRow.expiresAt.getTime() < Date.now()) {
        return null;
    }

    const sessionAlive = await touchSession(
        toScope(tokenRow.tokenableId),
        tokenRow.id,
    );
    if (!sessionAlive) {
        return null;
    }

    const member = await TeamMember.findByPk(tokenRow.tokenableId);
    if (!member) {
        return null;
    }
    if (
        member.status === TEAM_MEMBER_INACTIVE ||
        member.status === TEAM_MEMBER_DISABLED
    ) {
        return null;
    }

    void tokenRow.update({ lastUsedAt: new Date() }).catch(() => undefined);

    return { member, tokenId: tokenRow.id };
};

export const revokeTeamToken = async (
    tokenId: number,
    memberId: number,
): Promise<void> => {
    await Promise.allSettled([
        PersonalAccessToken.destroy({ where: { id: tokenId } }),
        endSession(toScope(memberId), tokenId),
    ]);
};

export const revokeAllTeamTokens = async (memberId: number): Promise<void> => {
    const tokens = await PersonalAccessToken.findAll({
        where: {
            tokenableId: memberId,
            tokenableType: TOKENABLE_TEAM_MEMBER,
        },
        attributes: ["id"],
    });
    await Promise.allSettled([
        PersonalAccessToken.destroy({
            where: {
                tokenableId: memberId,
                tokenableType: TOKENABLE_TEAM_MEMBER,
            },
        }),
        ...tokens.map((token) => endSession(toScope(memberId), token.id)),
    ]);
};
