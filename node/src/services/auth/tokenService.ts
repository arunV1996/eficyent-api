import { User } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { Secrets } from "../../config/secrets";
import { env } from "../../config/env";
import { randomTokenBase64Url, sha256Hex, safeEqual } from "../../helpers/crypto";
import { sessionService } from "./sessionService";

/**
 * Opaque-token authentication, equivalent to Laravel Sanctum's
 * personal_access_tokens table. The plaintext token is shown to the client
 * exactly once; we store only an HMAC-SHA-256 fingerprint (peppered with a
 * secret loaded from AWS Secrets Manager).
 *
 * Issued tokens carry the format:
 *
 *   <id>|<random>
 *
 * where <id> is the row id in personal_access_tokens, and <random> is
 * TOKEN_BYTES bytes of CSPRNG output (base64-url).
 *
 * On every authenticated request:
 *   1. Parse `id|random` from the Authorization header.
 *   2. Look up the row by id.
 *   3. Constant-time compare HMAC(random, pepper) with the stored hash.
 *   4. Check expiry and that the user still exists / is active.
 *   5. Touch the Redis session for inactivity timeout.
 *
 * Revocation: deleting the row in personal_access_tokens AND deleting the
 * Redis session both invalidate the token immediately.
 */

export type TokenAbility = "authentication" | "encryption";

export interface IssuedToken {
  plaintext: string;
  expiresAt: Date | null;
  expiresInSeconds: number | null;
}

const TOKEN_NAME_INTERNAL = "internal-api-token";

async function pepper(): Promise<string> {
  return (await Secrets.auth()).TOKEN_PEPPER;
}

export const tokenService = {
  async issue(
    user: Pick<User, "id">,
    abilities: TokenAbility[] = ["authentication"],
    ttlSeconds: number | null = null,
    name = TOKEN_NAME_INTERNAL,
  ): Promise<IssuedToken> {
    const random = randomTokenBase64Url(env().TOKEN_BYTES);
    const tokenHash = sha256Hex(random, await pepper());
    const expiresAt =
      ttlSeconds !== null ? new Date(Date.now() + ttlSeconds * 1000) : null;

    const row = await prisma().personalAccessToken.create({
      data: {
        tokenableType: "App\\Models\\User",
        tokenableId: user.id,
        name,
        tokenHash,
        abilities: JSON.stringify(abilities),
        expiresAt,
      },
    });

    const plaintext = `${row.id.toString()}|${random}`;
    await sessionService.start(user.id, row.id, ttlSeconds);
    return {
      plaintext,
      expiresAt,
      expiresInSeconds: ttlSeconds,
    };
  },

  async authenticate(
    bearer: string,
  ): Promise<{ user: User; tokenId: bigint } | null> {
    const idx = bearer.indexOf("|");
    if (idx <= 0) return null;
    const idStr = bearer.slice(0, idx);
    const random = bearer.slice(idx + 1);
    if (!/^\d+$/.test(idStr) || random.length === 0) return null;

    const id = BigInt(idStr);
    const row = await prisma().personalAccessToken.findUnique({
      where: { id },
    });
    if (!row || row.tokenableType !== "App\\Models\\User") return null;

    const user = await prisma().user.findUnique({
      where: { id: row.tokenableId },
    });
    if (!user) return null;

    const expectedHash = sha256Hex(random, await pepper());
    if (!safeEqual(row.tokenHash, expectedHash)) return null;

    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

    // Inactivity check via Redis. Missing session = forced logout.
    const sessionAlive = await sessionService.touch(
      user.id,
      row.id,
    );
    if (!sessionAlive) return null;

    if (user.status !== 1) return null;

    // Update last_used_at. Best-effort; do not block request on failure.
    void prisma()
      .personalAccessToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return { user, tokenId: row.id };
  },

  async revoke(tokenId: bigint, userId: bigint): Promise<void> {
    await Promise.allSettled([
      prisma().personalAccessToken.delete({ where: { id: tokenId } }),
      sessionService.end(userId, tokenId),
    ]);
  },

  async revokeAllForUser(userId: bigint): Promise<void> {
    const tokens = await prisma().personalAccessToken.findMany({
      where: { tokenableId: userId, tokenableType: "App\\Models\\User" },
      select: { id: true },
    });
    await Promise.allSettled([
      prisma().personalAccessToken.deleteMany({
        where: { tokenableId: userId, tokenableType: "App\\Models\\User" },
      }),
      ...tokens.map((t) => sessionService.end(userId, t.id)),
    ]);
  },
};
