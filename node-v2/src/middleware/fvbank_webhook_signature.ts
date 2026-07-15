import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Mirror of the legacy fvbankWebhookSignature middleware
 * (App\Http\Middleware\VerifyFVBankSignature).
 *
 * FvBank signs each webhook payload with HMAC-SHA256 keyed on the
 * client_secret from the FvBank auth bundle; the signature arrives in
 * the `x-signature` header. Verification HMACs the raw request body
 * (Buffer captured by the express.json verify hook in app.ts) and
 * constant-time compares against the header.
 *
 * Configuration: EXTERNAL_FVBANK_CLIENT_SECRET (same key the legacy
 * service reads from its EXTERNAL_FVBANK_* secret bundle).
 *
 * Failure envelopes mirror the legacy middleware exactly:
 *   - missing header / unconfigured secret -> 401 {"error":"Unauthorized"}
 *   - signature mismatch -> 401 {success:false, error:"Error", error_code:181}
 *     (code 181 has no catalog message upstream, so the text is "Error")
 */
export const fvbankWebhookSignature = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    try {
        const signature = req.header("x-signature");
        if (!signature) {
            // eslint-disable-next-line no-console
            console.warn("FVBank Webhook: missing x-signature header");
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const clientSecret = process.env.EXTERNAL_FVBANK_CLIENT_SECRET;
        if (!clientSecret) {
            // eslint-disable-next-line no-console
            console.warn(
                "FVBank Webhook: EXTERNAL_FVBANK_CLIENT_SECRET not configured",
            );
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        // Prefer the captured raw body for byte-exact verification. If
        // the verify hook didn't run (e.g. non-JSON content-type), fall
        // back to canonical JSON of the parsed body.
        const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
        const payload =
            rawBody && rawBody.length > 0
                ? rawBody
                : Buffer.from(JSON.stringify(req.body ?? {}));

        const computed = crypto
            .createHmac("sha256", clientSecret)
            .update(payload)
            .digest("hex");

        if (
            computed.length !== signature.length ||
            !crypto.timingSafeEqual(
                Buffer.from(computed, "utf8"),
                Buffer.from(signature, "utf8"),
            )
        ) {
            // eslint-disable-next-line no-console
            console.warn("FVBank Webhook: signature mismatch");
            res.sendError("Error", 181, 401);
            return;
        }

        next();
    } catch (verificationError) {
        // eslint-disable-next-line no-console
        console.error("FVBank Webhook verification failed:", verificationError);
        res.handleError(verificationError);
    }
};
