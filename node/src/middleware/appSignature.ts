import { NextFunction, Request, Response } from "express";
import { createHmac, createPublicKey, createVerify } from "crypto";
import { ApiException } from "../helpers/errors";
import { prisma } from "../db/prisma";
import { decryptEnvelope } from "../config/kms";
import { logger } from "../helpers/logger";

/**
 * Mirror of App\\Http\\Middleware\\Api\\AppSignature.
 *
 * Headers required:
 *   X-Api-Key        - identifier of the calling user/team/merchant
 *   X-Api-Timestamp  - unix seconds; replay window enforced (commented out
 *                      in Laravel via SIGNATURE_TIMESTAMP_BUFFER but we
 *                      enforce it here).
 *   X-Api-Signature  - base64( RSA-SHA256( HMAC-SHA256(plain, salt_key) ) )
 *
 * plain = "/<lastPathSegment>" + json(body) + timestamp + salt_key
 *
 * Per Laravel, the caller can be a User, TeamMember, or Merchant. salt_key
 * and public_key are stored *encrypted* on the model and decrypted via KMS
 * envelope here (Laravel used Crypt::decryptString on Laravel APP_KEY).
 */

const REPLAY_WINDOW_SECONDS = 300;

interface KeyMaterial {
  publicKeyPem: string;
  saltKey: string;
}

async function resolveCaller(apiKey: string): Promise<{
  type: "user" | "team" | "merchant";
  keys: KeyMaterial;
}> {
  // TeamMember + Merchant lookups will be wired when those modules are
  // ported (Phase 7 / Phase 8). For Phase 2 we resolve users only.
  const user = await prisma().user.findFirst({ where: { apiKey } });
  if (user && user.publicKey && user.saltKey) {
    return {
      type: "user",
      keys: {
        publicKeyPem: await decryptEnvelope(user.publicKey),
        saltKey: await decryptEnvelope(user.saltKey),
      },
    };
  }
  throw new ApiException(102);
}

function cleanBody(body: unknown): unknown {
  if (body === null || body === undefined) return "";
  if (Array.isArray(body)) return body.map(cleanBody);
  if (typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      out[k] = cleanBody(v);
    }
    return Object.keys(out).length === 0 ? {} : out;
  }
  return body;
}

export function appSignature() {
  return async function (req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const apiKey = req.header("x-api-key");
      const sig = req.header("x-api-signature");
      const ts = req.header("x-api-timestamp");
      if (!apiKey) throw new ApiException(110);
      if (!sig) throw new ApiException(111);
      if (!ts) throw new ApiException(128);

      const requestTime = parseInt(ts, 10);
      if (!Number.isFinite(requestTime)) throw new ApiException(128);
      const drift = Math.abs(Math.floor(Date.now() / 1000) - requestTime);
      if (drift > REPLAY_WINDOW_SECONDS) {
        throw new ApiException(129);
      }

      const { keys } = await resolveCaller(apiKey);

      const lastSegment = req.path.split("/").filter(Boolean).pop() ?? "";
      const endpoint = `/${lastSegment}`;
      const cleaned = cleanBody(req.body ?? {});
      const bodyJson =
        cleaned && Object.keys(cleaned as object).length === 0
          ? "{}"
          : JSON.stringify(cleaned);
      const plain = `${endpoint}${bodyJson}${ts}${keys.saltKey}`;
      const hmac = createHmac("sha256", keys.saltKey).update(plain).digest("hex");

      const publicKey = createPublicKey({ key: keys.publicKeyPem, format: "pem" });
      const verifier = createVerify("RSA-SHA256");
      verifier.update(hmac);
      verifier.end();
      const ok = verifier.verify(publicKey, Buffer.from(sig, "base64"));
      if (!ok) {
        logger.warn(
          { received: sig, expectedHmac: hmac, plainLen: plain.length },
          "App signature verification failed",
        );
        throw new ApiException(112);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
