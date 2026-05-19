import { generateKeyPairSync, randomBytes } from "crypto";
import { prisma } from "../../db/prisma";
import { tokenService } from "./tokenService";
import { encryptEnvelope } from "../../config/kms";
import { EXTERNAL_API_TOKEN, ENCRYPTION_ABILITY } from "../../helpers/constants";

/**
 * Service specifically for generating and persisting secure API credentials.
 */
export const credentialService = {
  /**
   * Generates api_key, salt_key, and RSA key pair, encrypts them using the
   * KMS envelope, and updates either a User or TeamMember record.
   *
   * @param id - The row ID of the model
   * @param model - "user" (default) or "teamMember"
   * @param tx - Optional Prisma transaction client
   */
  async generateAndStore(
    id: bigint,
    model: "user" | "teamMember" = "user",
    tx?: any,
  ) {
    const db = tx || prisma();

    // 1. Generate API Key (Sanctum plainTextToken equivalent)
    const token = await tokenService.issue(
      { id },
      [ENCRYPTION_ABILITY as any],
      null,
      EXTERNAL_API_TOKEN,
    );

    // 2. Generate Salt Key (8 bytes random hex)
    const saltKeyPlain = randomBytes(8).toString("hex");

    // 3. Generate RSA Key Pair
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // 4. Encrypt and Update (using KMS Envelope encryption)
    const data = {
      apiKey: token.plaintext,
      saltKey: await encryptEnvelope(saltKeyPlain),
      publicKey: await encryptEnvelope(publicKey),
      privateKey: await encryptEnvelope(privateKey),
    };

    if (model === "user") {
      return await db.user.update({
        where: { id },
        data,
      });
    } else {
      return await db.teamMember.update({
        where: { id },
        data,
      });
    }
  },
};
