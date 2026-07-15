import { Request } from "express";

/**
 * Pulls uploaded file bytes off a request for the bulk-import
 * endpoints. The file arrives either as a multipart `file` field
 * (parsed by a route-level multer onto req.file) or as a base64 data:
 * URL / raw base64 string on req.body.file — mirror of the legacy
 * extractUploadedFileBuffer.
 */
export const extractUploadedFileBuffer = (req: Request): Buffer | null => {
    const multerFile = (req as Request & { file?: { buffer?: Buffer } }).file;
    if (multerFile?.buffer && multerFile.buffer.length > 0) {
        return multerFile.buffer;
    }
    const bodyFile = (req.body as { file?: unknown }).file;
    if (typeof bodyFile === "string" && bodyFile.length > 0) {
        const base64 = bodyFile.startsWith("data:")
            ? (bodyFile.split(",", 2)[1] ?? "")
            : bodyFile;
        if (base64) {
            try {
                return Buffer.from(base64, "base64");
            } catch {
                return null;
            }
        }
    }
    return null;
};
