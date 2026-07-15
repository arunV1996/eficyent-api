import { generateKeyPairSync, randomBytes } from "crypto";
import { Transaction } from "sequelize";
import Merchant from "../models/merchant.model";
import TeamMember from "../models/team_member.model";
import User from "../models/user.model";
import { encryptEnvelope } from "./crypto.helper";
import { issueTeamToken } from "./team_token.helper";
import { issueToken, TOKEN_NAME_EXTERNAL } from "./token.helper";

/**
 * API credential generation (mirror of the legacy credentialService).
 *
 *   api_key     plaintext external-api token (Sanctum-style; also a
 *               personal_access_tokens row with the "encryption"
 *               ability)
 *   salt_key    8 random bytes hex, Laravel-encrypted at rest
 *   RSA pair    2048-bit; both PEMs Laravel-encrypted at rest
 *
 * Clients sign requests with the private key; the appSignature
 * middleware verifies with the stored public key.
 */

const generateRsaKeyPair = (): { publicKey: string; privateKey: string } => {
    return generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
};

export const generateAndStoreCredentials = async (
    userOrMerchantId: number,
    model: "user" | "merchant" | "teamMember" = "user",
    options: { transaction?: Transaction } = {},
): Promise<User | Merchant | TeamMember> => {
    // Team-member api keys are personal_access_tokens rows scoped to
    // the TeamMember morph; user/merchant keys stay on the User morph.
    const issued =
        model === "teamMember"
            ? await issueTeamToken(
                  { id: userOrMerchantId },
                  null,
                  ["encryption"],
                  TOKEN_NAME_EXTERNAL,
              )
            : await issueToken(
                  { id: userOrMerchantId },
                  ["encryption"],
                  null,
                  TOKEN_NAME_EXTERNAL,
              );
    const saltKeyPlain = randomBytes(8).toString("hex");
    const { publicKey, privateKey } = generateRsaKeyPair();

    const credentialData = {
        apiKey: issued.plaintext,
        saltKey: await encryptEnvelope(saltKeyPlain),
        publicKey: await encryptEnvelope(publicKey),
        privateKey: await encryptEnvelope(privateKey),
    };

    if (model === "teamMember") {
        const teamMember = await TeamMember.findByPk(userOrMerchantId, {
            transaction: options.transaction,
        });
        if (!teamMember) {
            throw new Error("Team member not found for credential generation");
        }
        return teamMember.update(credentialData, {
            transaction: options.transaction,
        });
    }

    if (model === "merchant") {
        const merchant = await Merchant.unscoped().findByPk(userOrMerchantId, {
            transaction: options.transaction,
        });
        if (!merchant) {
            throw new Error("Merchant not found for credential generation");
        }
        return merchant.update(credentialData, {
            transaction: options.transaction,
        });
    }

    const user = await User.unscoped().findByPk(userOrMerchantId, {
        transaction: options.transaction,
    });
    if (!user) {
        throw new Error("User not found for credential generation");
    }
    return user.update(credentialData, { transaction: options.transaction });
};

export const rotateRsaKeys = async (
    userOrMerchantId: number,
    model: "user" | "merchant" | "teamMember" = "user",
): Promise<User | Merchant | TeamMember> => {
    const { publicKey, privateKey } = generateRsaKeyPair();
    const rotatedData = {
        publicKey: await encryptEnvelope(publicKey),
        privateKey: await encryptEnvelope(privateKey),
    };

    if (model === "teamMember") {
        const teamMember = await TeamMember.findByPk(userOrMerchantId);
        if (!teamMember) {
            throw new Error("Team member not found for key rotation");
        }
        return teamMember.update(rotatedData);
    }

    if (model === "merchant") {
        const merchant = await Merchant.unscoped().findByPk(
            userOrMerchantId,
        );
        if (!merchant) {
            throw new Error("Merchant not found for key rotation");
        }
        return merchant.update(rotatedData);
    }

    const user = await User.unscoped().findByPk(userOrMerchantId);
    if (!user) {
        throw new Error("User not found for key rotation");
    }
    return user.update(rotatedData);
};
