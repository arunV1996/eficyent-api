import { NextFunction, Request, Response } from "express";
import { createHmac, createPublicKey, createVerify } from "crypto";
import User from "../models/user.model";
import { decryptEnvelope } from "../helpers/crypto.helper";

/**
 * Mirror of App\Http\Middleware\Api\AppSignature.
 *
 * Headers required:
 *   X-Api-Key        - the caller's api_key (from get-credentials)
 *   X-Api-Timestamp  - unix seconds; 300s replay window enforced
 *   X-Api-Signature  - base64( RSA-SHA256( HMAC-SHA256(plain, salt) ) )
 *
 *   plain = "/<lastPathSegment>" + json(payload) + timestamp + salt_key
 *
 * payload mirrors Laravel's $request->all(): query parameters and the
 * parsed body merged into one object (body keys win, like Laravel's
 * input-source precedence) — so GET endpoints sign their query string
 * (skip/take/...) exactly like the legacy backend.
 *
 * salt_key and public_key are stored Laravel-encrypted on the user
 * row and decrypted here. Team-member and merchant callers arrive
 * with their module tranches.
 *
 * Mounting matches the legacy service: the middleware is exported but
 * not applied to any route group by default; set SIGNATURE_ENFORCED=
 * true to gate the post-onboarding groups (see api.routes.ts).
 */

const REPLAY_WINDOW_SECONDS = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanBody = (body: any): any => {
    if (body === null || body === undefined) {
        return "";
    }
    if (Array.isArray(body)) {
        return body.map(cleanBody);
    }
    if (typeof body === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(body)) {
            cleaned[key] = cleanBody(value);
        }
        return cleaned;
    }
    return body;
};

export const appSignature = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const apiKey = req.header("x-api-key");
        const signature = req.header("x-api-signature");
        const timestampHeader = req.header("x-api-timestamp");
        if (!apiKey) {
            return res.sendError(res.__("sig_110"), 110, 400);
        }
        if (!signature) {
            return res.sendError(res.__("sig_111"), 111, 400);
        }
        if (!timestampHeader) {
            return res.sendError(res.__("sig_128"), 128, 400);
        }

        const requestTime = parseInt(timestampHeader, 10);
        if (!Number.isFinite(requestTime)) {
            return res.sendError(res.__("sig_128"), 128, 400);
        }
        const drift = Math.abs(Math.floor(Date.now() / 1000) - requestTime);
        if (drift > REPLAY_WINDOW_SECONDS) {
            return res.sendError(res.__("sig_129"), 129, 400);
        }

        const caller = await User.unscoped().findOne({
            where: { apiKey },
        });
        if (!caller || !caller.publicKey || !caller.saltKey) {
            return res.sendError("User not found.", 102, 400);
        }
        const publicKeyPem = await decryptEnvelope(caller.publicKey);
        const saltKey = await decryptEnvelope(caller.saltKey);

        const lastSegment = req.path.split("/").filter(Boolean).pop() ?? "";
        const endpoint = `/${lastSegment}`;
        // Laravel $request->all(): query + body merged, body wins.
        const rawPayload = { ...req.query, ...(req.body || {}) };
        const cleanedBody = cleanBody(rawPayload);
        const bodyJson =
            cleanedBody && Object.keys(cleanedBody as object).length === 0
                ? "{}"
                : JSON.stringify(cleanedBody);
        const plainContent = `${endpoint}${bodyJson}${timestampHeader}${saltKey}`;
        const hmac = createHmac("sha256", saltKey)
            .update(plainContent)
            .digest("hex");

        const publicKey = createPublicKey({
            key: publicKeyPem,
            format: "pem",
        });
        const verifier = createVerify("RSA-SHA256");
        verifier.update(hmac);
        verifier.end();
        const isValid = verifier.verify(
            publicKey,
            Buffer.from(signature, "base64"),
        );
        if (!isValid) {
            return res.sendError(res.__("sig_112"), 112, 400);
        }
        next();
    } catch (error) {
        res.handleError(error);
    }
};

/**
 * Env-gated wrapper: enforced only when SIGNATURE_ENFORCED=true —
 * a pass-through otherwise, matching the legacy service where the
 * middleware exists but is not yet mounted.
 */
export const appSignatureIfEnforced = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    if (process.env.SIGNATURE_ENFORCED === "true") {
        void appSignature(req, res, next);
        return;
    }
    next();
};
