import multer from "multer";
import { NextFunction, Request, Response } from "express";
import { logger } from "../helpers/logger";
import { ApiException } from "../helpers/errors";
import { s3Service } from "../services/storage/s3Service";

/**
 * Multipart file-upload middleware.
 *
 * The Laravel codebase accepts files via either multipart upload OR a
 * base64 data URL in JSON. We support both shapes the same way: after
 * this middleware runs, every uploaded file is rewritten in place on
 * req.body as a base64 data URL. Downstream services (s3Service.uploadBase64)
 * already handle that shape. Net effect: handlers don't care which
 * transport the client used.
 *
 * Limits:
 *   - 8 MiB per file
 *   - 6 files per request
 *   - 64 KiB total non-file form-data
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 6,
    fields: 64,
    fieldSize: 64 * 1024,
  },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "application/pdf",
]);

interface MulterFile {
  fieldname: string;
  mimetype: string;
  buffer: Buffer;
  originalname: string;
  size: number;
}

function inlineFilesAsBase64(req: Request): void {
  // Multer puts files on req.files. Convert each to a base64 data URL
  // and place at req.body[fieldname] so the controller treats it like
  // any other base64 input.
  const filesUnknown = (req as Request & { files?: unknown }).files;
  if (!filesUnknown) return;
  if (!Array.isArray(filesUnknown) && typeof filesUnknown !== "object") return;

  const fileList: MulterFile[] = Array.isArray(filesUnknown)
    ? (filesUnknown as MulterFile[])
    : Object.values(filesUnknown as Record<string, MulterFile[]>).flat();

  for (const f of fileList) {
    if (!ALLOWED_MIME.has(f.mimetype)) {
      throw new ApiException(
        422,
        `Unsupported file type: ${f.mimetype}`,
        422,
      );
    }
    const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
    if (typeof req.body !== "object" || req.body === null) req.body = {};
    (req.body as Record<string, unknown>)[f.fieldname] = dataUrl;
  }
}

/**
 * Generic any-field upload. Use `.fields([...])` form when the controller
 * needs nested file groups; this `any()` form is fine for the simple
 * single-file fields the Laravel codebase uses (proof, supporting_document,
 * remitter_proof, document_file, document_back_file).
 */
export function fileUpload() {
  return [
    upload.any(),
    (req: Request, _res: Response, next: NextFunction): void => {
      try {
        inlineFilesAsBase64(req);
        next();
      } catch (err) {
        next(err);
      }
    },
  ];
}

/**
 * Direct-to-S3 helper used by handlers that want a pre-uploaded URL on
 * a non-multipart code path. Accepts either an https:// URL (no-op) or a
 * data: URL and returns the canonical S3 URL.
 */
export async function persistFileField(
  value: string | undefined,
  path: string,
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("https://")) return value;
  if (value.startsWith("data:")) {
    const url = await s3Service.safeUpload(
      {
        buffer: Buffer.from(value.split(",")[1] ?? "", "base64"),
        contentType: value.match(/^data:([^;]+);/)?.[1] ?? "application/octet-stream",
      },
      path,
    );
    if (!url) {
      logger.warn({ path }, "persistFileField - S3 upload failed");
      return null;
    }
    return url;
  }
  return null;
}
