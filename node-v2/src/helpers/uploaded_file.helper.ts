import { Request } from "express";

interface MulterFile {
    fieldname: string;
    buffer?: Buffer;
}

/**
 * Pulls uploaded file bytes off a request for the bulk-import
 * endpoints (mirror of the legacy extractUploadedFileBuffer). The file
 * arrives either:
 *   - as a multipart part parsed by the global formDataHandler
 *     (multer().any()) onto req.files — matched by field name, falling
 *     back to the first file; or
 *   - as a base64 data: URL / raw base64 string on req.body[field].
 */
export const extractUploadedFileBuffer = (
    req: Request,
    fieldName = "file",
): Buffer | null => {
    const bodyValue = (req.body as Record<string, unknown> | undefined)?.[
        fieldName
    ];
    if (typeof bodyValue === "string" && bodyValue.length > 0) {
        const base64 = bodyValue.startsWith("data:")
            ? (bodyValue.split(",", 2)[1] ?? "")
            : bodyValue;
        if (base64) {
            try {
                return Buffer.from(base64, "base64");
            } catch {
                return null;
            }
        }
    }

    const filesUnknown = (req as Request & { files?: unknown }).files;
    if (
        filesUnknown &&
        (Array.isArray(filesUnknown) || typeof filesUnknown === "object")
    ) {
        const fileList: MulterFile[] = Array.isArray(filesUnknown)
            ? (filesUnknown as MulterFile[])
            : Object.values(
                  filesUnknown as Record<string, MulterFile[]>,
              ).flat();
        const match =
            fileList.find((file) => file.fieldname === fieldName) ??
            fileList[0];
        if (match?.buffer && match.buffer.length > 0) {
            return match.buffer;
        }
    }

    const singleFile = (req as Request & { file?: MulterFile }).file;
    if (singleFile?.buffer && singleFile.buffer.length > 0) {
        return singleFile.buffer;
    }

    return null;
};
