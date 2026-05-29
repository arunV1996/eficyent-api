import { TeamMember } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { Secrets } from "../../config/secrets";
import { env } from "../../config/env";
import {
  randomTokenBase64Url,
  safeEqual,
  sha256Hex,
} from "../../helpers/crypto";
import {
  TOKENABLE_TEAM_MEMBER,
  TEAM_MEMBER_INACTIVE,
  TEAM_MEMBER_DISABLED,
} from "../../helpers/constants";
import { sessionService } from "./sessionService";

/**
 * Team-member opaque token issuance/verification.
 *
 * We share the personal_access_tokens table with the user-side flow but
 * scope by tokenable_type (Sanctum's morph convention). This way a single
 * /logout path can revoke either kind of token without table-bouncing.
 *
 * Sessions are stored in Redis under the same `sess:{...}` key family but
 * with a `tm:` prefix on the user-id segment so user-side sessions and
 * team-member sessions never collide.
 */

const TOKEN_NAME_TEAM = "team_member_token";

async function pepper(): Promise<string> {
  return (await Secrets.auth()).TOKEN_PEPPER;
}

export interface IssuedTeamToken {
  plaintext: string;
  expiresAt: Date | null;
}

export const teamTokenService = {
  async issue(
    member: Pick<TeamMember, "id">,
    ttlSeconds: number | null = null,
  ): Promise<IssuedTeamToken> {
    const random = randomTokenBase64Url(env().TOKEN_BYTES);
    const tokenHash = sha256Hex(random, await pepper());
    const expiresAt =
      ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000) : null;
    const row = await prisma().personalAccessToken.create({
      data: {
        tokenableType: TOKENABLE_TEAM_MEMBER,
        tokenableId: member.id,
        name: TOKEN_NAME_TEAM,
        tokenHash,
        abilities: JSON.stringify(["authentication"]),
        expiresAt,
      },
    });
    const plaintext = `${row.id.toString()}|${random}`;
    await sessionService.start(toScope(member.id), row.id, ttlSeconds);
    return { plaintext, expiresAt };
  },

  async authenticate(
    bearer: string,
  ): Promise<{ member: TeamMember; tokenId: bigint } | null> {
    const idx = bearer.indexOf("|");
    if (idx <= 0) return null;
    const idStr = bearer.slice(0, idx);
    const random = bearer.slice(idx + 1);
    if (!/^\d+$/.test(idStr) || random.length === 0) return null;
    const id = BigInt(idStr);

    const row = await prisma().personalAccessToken.findUnique({
      where: { id },
    });
    if (!row || row.tokenableType !== TOKENABLE_TEAM_MEMBER) return null;

    const expectedHash = sha256Hex(random, await pepper());
    if (!safeEqual(row.tokenHash, expectedHash)) return null;
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    const sessionAlive = await sessionService.touch(toScope(row.tokenableId), row.id);
    if (!sessionAlive) return null;

    const member = await prisma().teamMember.findUnique({
      where: { id: row.tokenableId },
    });
    if (!member || member.deletedAt) return null;
    if (
      member.status === TEAM_MEMBER_INACTIVE ||
      member.status === TEAM_MEMBER_DISABLED
    ) {
      return null;
    }

    void prisma()
      .personalAccessToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return { member, tokenId: row.id };
  },

  async revoke(tokenId: bigint, memberId: bigint): Promise<void> {
    await Promise.allSettled([
      prisma().personalAccessToken.delete({ where: { id: tokenId } }),
      sessionService.end(toScope(memberId), tokenId),
    ]);
  },

  async revokeAll(memberId: bigint): Promise<void> {
    const tokens = await prisma().personalAccessToken.findMany({
      where: { tokenableId: memberId, tokenableType: TOKENABLE_TEAM_MEMBER },
      select: { id: true },
    });
    await Promise.allSettled([
      prisma().personalAccessToken.deleteMany({
        where: { tokenableId: memberId, tokenableType: TOKENABLE_TEAM_MEMBER },
      }),
      ...tokens.map((t) => sessionService.end(toScope(memberId), t.id)),
    ]);
  },
};

/** Disjoint Redis namespace for team-member sessions. */
function toScope(memberId: bigint): bigint {
  // Reuse the same sess:{userId}:{tokenId} key family but with a
  // distinguishing high-bit. Negative bigints aren't used elsewhere, so
  // setting the sign on team-member ids gives us a guaranteed-unique scope.
  return -memberId;
}
