import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * S3 storage service (external integration, per the services doctrine).
 *
 * Only the signed-read-URL path is ported so far — that's all the
 * profile module needs. Upload helpers arrive with the onboarding /
 * documents tranche.
 *
 * Configuration comes from the environment:
 *   S3_BUCKET                       required at call time
 *   EXTERNAL_AWS_REGION | S3_REGION | AWS_REGION   region resolution order
 *   EXTERNAL_AWS_ACCESS_KEY_ID / EXTERNAL_AWS_SECRET_ACCESS_KEY
 *       optional — set when file storage lives in a different AWS
 *       account; otherwise the SDK default credential chain is used
 *   S3_USE_PATH_STYLE               "true" for path-style addressing
 *   AWS_TEMP_URL_EXPIRY_MIN         signed-URL lifetime, default 10
 */

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

const temporaryUrlExpiryMinutes = (): number => {
    return parseInt(process.env.AWS_TEMP_URL_EXPIRY_MIN || "10", 10);
};

const getClient = (): { client: S3Client; bucket: string } => {
    if (cachedClient && cachedBucket) {
        return { client: cachedClient, bucket: cachedBucket };
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
        throw new Error("S3_BUCKET is not configured");
    }

    const region =
        process.env.EXTERNAL_AWS_REGION ||
        process.env.S3_REGION ||
        process.env.AWS_REGION ||
        "us-east-1";

    const externalAccessKeyId = process.env.EXTERNAL_AWS_ACCESS_KEY_ID;
    const externalSecretAccessKey = process.env.EXTERNAL_AWS_SECRET_ACCESS_KEY;
    const useExternalCredentials =
        !!externalAccessKeyId && !!externalSecretAccessKey;

    cachedClient = new S3Client({
        region,
        forcePathStyle: process.env.S3_USE_PATH_STYLE === "true",
        ...(useExternalCredentials
            ? {
                  credentials: {
                      accessKeyId: externalAccessKeyId,
                      secretAccessKey: externalSecretAccessKey,
                  },
              }
            : {}),
    });
    cachedBucket = bucket;

    return { client: cachedClient, bucket: cachedBucket };
};

const mimeToExtension = (mime: string): string => {
    const extensionMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "application/pdf": "pdf",
    };
    return extensionMap[mime] ?? "bin";
};

interface UploadInput {
    buffer: Buffer;
    contentType: string;
    extension?: string;
}

/**
 * Uploads a binary blob to S3 under `<path>/<uuid>_<timestamp>.<ext>`
 * and returns the canonical https URL. Mirror of the legacy
 * s3Service.upload / Helper::uploadToS3.
 */
export const upload = async (
    input: UploadInput,
    path = "",
): Promise<string> => {
    const { client, bucket } = getClient();
    const extension = input.extension ?? mimeToExtension(input.contentType);
    const fileName = `${randomUUID().replace(/-/g, "")}_${Date.now()}.${extension}`;
    const objectKey = `${path.replace(/^\/+|\/+$/g, "")}/${fileName}`;

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: input.buffer,
            ContentType: input.contentType,
            ACL: "private",
        }),
    );

    const region =
        process.env.EXTERNAL_AWS_REGION ||
        process.env.S3_REGION ||
        process.env.AWS_REGION ||
        "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}`;
};

/**
 * Decodes a base64 data URL and uploads it. Mirror of the legacy
 * s3Service.uploadBase64 / Helper::uploadBase64ToS3.
 */
export const uploadBase64 = async (
    dataUrl: string,
    path = "",
): Promise<string> => {
    const match = /^data:(.*?);base64,([\s\S]+)$/.exec(dataUrl);
    if (!match) {
        throw new Error("Invalid data URL");
    }
    const contentType = match[1] || "application/octet-stream";
    const buffer = Buffer.from(match[2] ?? "", "base64");
    if (buffer.length === 0) {
        throw new Error("Empty base64 payload");
    }
    return upload({ buffer, contentType }, path);
};

/**
 * Returns a signed read URL for an S3 object. Accepts either a bare
 * key or a full https URL (the key is extracted from the path).
 * Mirror of the legacy s3Service.temporaryUrl / Helper::temporary_s3_url.
 */
export const temporaryUrl = async (keyOrUrl: string): Promise<string> => {
    const { client, bucket } = getClient();

    let objectKey = keyOrUrl;
    if (keyOrUrl.startsWith("http")) {
        try {
            const parsedUrl = new URL(keyOrUrl);
            objectKey = parsedUrl.pathname.replace(/^\/+/, "");
        } catch {
            // Not a parseable URL — use the input as the key.
        }
    }

    return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
        { expiresIn: temporaryUrlExpiryMinutes() * 60 },
    );
};
