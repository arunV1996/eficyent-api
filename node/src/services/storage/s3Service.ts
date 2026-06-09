import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { Secrets } from "../../config/secrets";
import { env } from "../../config/env";
import { logger } from "../../helpers/logger";

/**
 * Mirror of Helper::uploadToS3 / uploadBase64ToS3 / temporary_s3_url.
 *
 * Bucket name + region are loaded from Secrets Manager (eficyent/<env>/aws).
 * IAM credentials come from the EC2/ECS/EKS task role - never from env vars.
 */

const TEMP_URL_EXPIRY_MIN = 10; // mirrors AWS_TEMP_URL_EXPIRY constant

let client: S3Client | null = null;
let bucket: string | null = null;
let region: string | null = null;

async function getClient(): Promise<{ client: S3Client; bucket: string }> {
  if (client && bucket) return { client, bucket };
  const aws = await Secrets.aws();
  if (!aws.S3_BUCKET) throw new Error("S3_BUCKET not configured in Secrets Manager");
  bucket = aws.S3_BUCKET;
  region = aws.S3_REGION ?? env().AWS_REGION;
  client = new S3Client({
    region,
    forcePathStyle: aws.S3_USE_PATH_STYLE === true,
  });
  return { client, bucket };
}

interface UploadInput {
  buffer: Buffer;
  contentType: string;
  extension?: string;
}

export const s3Service = {
  /**
   * Upload a binary blob (typically already-decoded base64 or multer file
   * buffer) to S3 under `<path>/<uuid>_<timestamp>.<ext>` and return the
   * canonical https URL.
   */
  async upload(input: UploadInput, path = ""): Promise<string> {
    const { client: c, bucket: b } = await getClient();
    const ext = input.extension ?? mimeToExtension(input.contentType);
    const fileName = `${randomUUID().replace(/-/g, "")}_${Date.now()}.${ext}`;
    const key = `${path.replace(/^\/+|\/+$/g, "")}/${fileName}`;
    await c.send(
      new PutObjectCommand({
        Bucket: b,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
        ACL: "private",
      }),
    );
    const reg = region ?? env().AWS_REGION;
    return `https://${b}.s3.${reg}.amazonaws.com/${key}`;
  },

  async uploadBase64(dataUrl: string, path = ""): Promise<string> {
    const m = /^data:(.*?);base64,([\s\S]+)$/.exec(dataUrl);
    if (!m) throw new Error("Invalid data URL");
    const contentType = m[1] ?? "application/octet-stream";
    const buffer = Buffer.from(m[2] ?? "", "base64");
    if (buffer.length === 0) throw new Error("Empty base64 payload");
    return this.upload({ buffer, contentType }, path);
  },

  /**
   * Mirror of Helper::temporary_s3_url. Accepts either a key or a full URL
   * and returns a signed read URL valid for AWS_TEMP_URL_EXPIRY minutes.
   */
  async temporaryUrl(input: string): Promise<string> {
    const { client: c, bucket: b } = await getClient();
    let key = input;
    if (input.startsWith("http")) {
      try {
        const url = new URL(input);
        key = url.pathname.replace(/^\/+/, "");
      } catch {
        // Fall through; use as-is.
      }
    }
    return getSignedUrl(c, new GetObjectCommand({ Bucket: b, Key: key }), {
      expiresIn: TEMP_URL_EXPIRY_MIN * 60,
    });
  },

  /** Best-effort logging upload helper. Returns null on failure - matches Laravel. */
  async safeUpload(input: UploadInput, path = ""): Promise<string | null> {
    try {
      return await this.upload(input, path);
    } catch (err) {
      logger.error({ err, path }, "S3 upload failed");
      return null;
    }
  },
};

function mimeToExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  if (mime in map) return map[mime] as string;
  const after = mime.split("/")[1];
  return after ?? "bin";
}
