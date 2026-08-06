import { Request } from "express";
import PersonalAccessToken from "../models/personal_access_token.model";
import User from "../models/user.model";
import { decryptEnvelope, encryptEnvelope } from "./crypto.helper";
import { checkBackupCode, verifyTotp } from "./totp.helper";

/**
 * Transaction-level two-factor enforcement (mirror of the Laravel
 * requiresTfa() helper + TfaRule). Endpoints that move money (payout
 * store, direct, bulk store, account validation) demand a fresh
 * verification code whenever the caller authenticates with a
 * non-expiring token and has TFA enabled.
 *
 * Backup codes are strictly single-use: a successful backup-code match
 * consumes the code and persists the remaining set, so a code spent at
 * login can never be replayed for a transaction (and vice versa).
 */

/**
 * Mirror of the Laravel requiresTfa() view helper:
 *   - team-member sessions never require per-transaction TFA
 *   - users without TFA enabled never require it
 *   - a missing token row or a token with no expiry (long-lived API
 *     token) requires a fresh code per transaction
 *   - interactive tokens with an expiry are trusted (TFA happened at
 *     login)
 */
export const requiresTransactionTfa = async (
    req: Request,
): Promise<boolean> => {
    if (req.teamMember) {
        return false;
    }
    if (!req.user || !req.user.isTfaEnabled) {
        return false;
    }
    const tokenRow = req.tokenId
        ? await PersonalAccessToken.findByPk(req.tokenId)
        : null;
    if (!tokenRow || tokenRow.expiresAt === null) {
        return true;
    }
    return false;
};

/**
 * Mirror of Helper::verifyTfaCode — TOTP first, then the single-use
 * backup codes. A backup-code match consumes the code immediately
 * (re-encrypted remaining set persisted) before returning true.
 */
export const verifyAndConsumeTfaCode = async (
    user: User,
    verificationCode: string,
): Promise<boolean> => {
    if (!user.tfaSecret) {
        return false;
    }

    let totpOk = false;
    try {
        totpOk = await verifyTotp(user.tfaSecret, verificationCode);
    } catch {
        // Undecryptable secret — fall through to the backup codes.
    }
    if (totpOk) {
        return true;
    }

    if (!user.backupCodes) {
        return false;
    }
    let plaintextCodes = user.backupCodes;
    if (!/^\d{6}(,\d{6})*$/.test(plaintextCodes)) {
        try {
            plaintextCodes = await decryptEnvelope(plaintextCodes);
        } catch {
            // Leave as-is; the check below simply won't match.
        }
    }
    const backupCheck = checkBackupCode(plaintextCodes, verificationCode);
    if (!backupCheck.ok) {
        return false;
    }
    const encryptedRemaining = backupCheck.remaining
        ? await encryptEnvelope(backupCheck.remaining)
        : null;
    await User.update(
        { backupCodes: encryptedRemaining },
        { where: { id: user.id } },
    );
    return true;
};

/**
 * Gate used by the transaction endpoints: returns true when the
 * request either does not require per-transaction TFA or carries a
 * valid (and, for backup codes, now-consumed) verification code.
 */
export const passesTransactionTfa = async (req: Request): Promise<boolean> => {
    if (!(await requiresTransactionTfa(req))) {
        return true;
    }
    const verificationCode = req.body?.verification_code;
    if (
        verificationCode === undefined ||
        verificationCode === null ||
        String(verificationCode).trim() === ""
    ) {
        return false;
    }
    const fullUser = await User.unscoped().findByPk(req.user!.id);
    if (!fullUser) {
        return false;
    }
    return verifyAndConsumeTfaCode(
        fullUser,
        String(verificationCode).replace(/\s+/g, ""),
    );
};
