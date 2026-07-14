import { NextFunction, Request, Response } from "express";

/**
 * Replicates Zod's `.strict()` object behavior from the legacy
 * validators: any request-body key outside the allowlist is rejected
 * with the same 422 envelope the legacy ZodError branch produced.
 */
export const strictBody = (allowedKeys: string[]) => {
    const allowed = new Set(allowedKeys);
    return (req: Request, res: Response, next: NextFunction): void => {
        const body = req.body;
        if (body && typeof body === "object" && !Array.isArray(body)) {
            const unknownKeys = Object.keys(body).filter(
                (key) => !allowed.has(key),
            );
            if (unknownKeys.length > 0) {
                return res.sendError(
                    `Unrecognized key(s) in object: ${unknownKeys
                        .map((key) => `'${key}'`)
                        .join(", ")}`,
                    422,
                    422,
                );
            }
        }
        next();
    };
};
