import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import moment from "moment-timezone";
import {
    ALPHA3_TO_ALPHA2,
    BENEFICIARY_TRANSACTION_CANCELLED,
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
    BENEFICIARY_TRANSACTION_EXPIRED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_REJECTED,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_REJECTED,
    DISPOSABLE_EMAIL_DOMAINS,
    ONBOARDING_STATUS_CREATED,
    ONBOARDING_STATUS_FAILED,
    ONBOARDING_STATUS_INITIATED,
    ONBOARDING_STATUS_PENDING,
    VIRTUAL_ACCOUNT_STATUS_CREATED,
    VIRTUAL_ACCOUNT_STATUS_FAILED,
    VIRTUAL_ACCOUNT_STATUS_PENDING,
    WALLET_STATUS_ACTIVE,
    WALLET_TRANSACTION_CANCELLED,
    WALLET_TRANSACTION_COMPLETED,
    WALLET_TRANSACTION_FAILED,
    WALLET_TRANSACTION_REJECTED,
} from "./constants";

/**
 * Standard Bcrypt password hashing (10 rounds) — matches Laravel's
 * default and the legacy /node passwordService, so hashes written by
 * any of the three services verify on all of them.
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

/**
 * Verifies a plaintext password against a stored Bcrypt hash. Supports
 * both the Laravel format ($2y$) and the JS format ($2a$/$2b$).
 * Returns false (never throws) on malformed hashes.
 */
export const comparePassword = async (
    password: string,
    storedHash: string,
): Promise<boolean> => {
    if (!storedHash) {
        return false;
    }
    try {
        const normalizedHash = storedHash.replace(/^\$2y\$/, "$2a$");
        return await bcrypt.compare(password, normalizedHash);
    } catch {
        return false;
    }
};

/**
 * Verify + optional upgrade (mirror of the legacy
 * passwordService.verifyAndUpgrade). When the hashing configuration is
 * upgraded in the future, `rehash` carries the new hash for the caller
 * to persist; today it never rehashes — identical to legacy.
 */
export const verifyAndUpgradePassword = async (
    storedHash: string,
    password: string,
): Promise<{ valid: boolean; rehash?: string }> => {
    const valid = await comparePassword(password, storedHash);
    return { valid };
};

/**
 * Generates an opaque Sanctum-style access token.
 *
 * The plaintext token is returned to the client and is never persisted;
 * only its SHA-256 fingerprint is stored in personal_access_tokens. This
 * matches the current /node behavior so existing client integrations
 * continue to work.
 */
export const generateAccessToken = (): {
    plaintextToken: string;
    tokenFingerprint: string;
} => {
    const plaintextToken = randomBytes(40).toString("hex");
    const tokenFingerprint = createHash("sha256")
        .update(plaintextToken)
        .digest("hex");
    return { plaintextToken, tokenFingerprint };
};

/**
 * Rebuilds the SHA-256 fingerprint from a plaintext token so we can
 * look it up in personal_access_tokens during authentication.
 */
export const fingerprintToken = (plaintextToken: string): string => {
    return createHash("sha256").update(plaintextToken).digest("hex");
};

/**
 * Generates a unique_id string of the requested length using
 * lowercase alphanumerics. Used for public-facing IDs on user rows.
 */
export const generateUniqueId = (length = 24): string => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let uniqueId = "";
    const bytes = randomBytes(length);
    for (let position = 0; position < length; position += 1) {
        uniqueId += alphabet[bytes[position] % alphabet.length];
    }
    return uniqueId;
};

/**
 * Generates a payout order id — TXN + last 8 digits of the unix
 * timestamp + 4 uppercase alphanumeric chars. Matches the inline
 * generator the payout store path uses, so retried transactions get a
 * fresh, same-shaped order id (mirror of the legacy generateOrderId).
 */
export const generateOrderId = (): string => {
    const timestamp = Math.floor(Date.now() / 1000)
        .toString()
        .slice(-8);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN${timestamp}${random}`;
};

/**
 * Formats a Date or ISO string as "12 Feb 2026 1:22 PM".
 */
export const formatDate = (
    date: Date | string | null | undefined,
    timezone = "UTC",
): string => {
    if (!date) {
        return "";
    }
    let resolvedTimezone = timezone;
    if (resolvedTimezone?.includes("Calcutta")) {
        resolvedTimezone = "Asia/Kolkata";
    }
    return moment.utc(date).tz(resolvedTimezone).format("D MMM YYYY h:mm A");
};

/**
 * True when the email's domain is on the disposable-provider blocklist.
 */
export const isDisposableEmail = (email: string): boolean => {
    const atPosition = email.lastIndexOf("@");
    if (atPosition === -1) {
        return false;
    }
    return DISPOSABLE_EMAIL_DOMAINS.has(
        email.slice(atPosition + 1).toLowerCase(),
    );
};

/**
 * Builds the flag asset URL for a country code (alpha-2 or alpha-3).
 * Mirror of the Laravel get_flag() helper which served
 * images/countries/<alpha2>.png from the public folder.
 */
export const getFlagUrl = (
    countryCode: string | null | undefined,
    baseUrl: string,
): string => {
    if (!countryCode) {
        return "";
    }
    const upperCode = countryCode.toUpperCase();
    const alpha2Code = ALPHA3_TO_ALPHA2[upperCode] || countryCode.toLowerCase();
    return `${baseUrl.replace(/\/$/, "")}/images/countries/${alpha2Code}.png`;
};

/**
 * Ten unique 6-digit backup codes joined by commas. Mirror of the
 * generateBackupCodes() helper used for TFA recovery codes.
 */
export const generateBackupCodes = (): string => {
    const backupCodes = new Set<string>();
    while (backupCodes.size < 10) {
        const randomValue = 100_000 + (randomBytes(4).readUInt32BE(0) % 900_000);
        backupCodes.add(String(randomValue));
    }
    return Array.from(backupCodes).join(",");
};

/**
 * Transaction reference number: 2-digit scope + UTC timestamp down to
 * milliseconds + 3 random digits. Mirror of
 * generateTransactionRefNumber().
 */
export const generateTransactionRefNumber = (
    scopeId: number | string,
): string => {
    const scopedId = String(scopeId).padStart(2, "0").slice(-2);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    const hours = String(now.getUTCHours()).padStart(2, "0");
    const minutes = String(now.getUTCMinutes()).padStart(2, "0");
    const seconds = String(now.getUTCSeconds()).padStart(2, "0");
    const millis = String(now.getUTCMilliseconds()).padStart(3, "0");
    const randomDigits = String(
        randomBytes(2).readUInt16BE(0) % 1000,
    ).padStart(3, "0");
    return `${scopedId}${year}${month}${day}${hours}${minutes}${seconds}${millis}${randomDigits}`;
};

/**
 * ISO timestamp N minutes from now, used as an OTP / email-code expiry.
 * Mirror of generateEmailCodeExpiry().
 */
export const generateEmailCodeExpiry = (minutesAhead = 10): string => {
    return new Date(Date.now() + minutesAhead * 60_000).toISOString();
};

/**
 * Legacy human date format: "26 Nov 2025 03:41 PM" (2-digit day and
 * hour, default timezone Asia/Kolkata). Mirror of the
 * helpers/lookups.formatDate variant used by beneficiary/transaction
 * resources — distinct from formatDate above, which uses 1-digit
 * day/hour and defaults to UTC.
 */
export const formatDateHuman = (
    date: Date | string | null | undefined,
    timezone = "Asia/Kolkata",
): string => {
    if (!date) {
        return "";
    }
    return moment.utc(date).tz(timezone).format("DD MMM YYYY hh:mm A");
};

/**
 * "YES"/"NO" from the tinyint / boolean flags the legacy tables use.
 */
export const yesNo = (value: number | boolean | null): string => {
    if (typeof value === "boolean") {
        return value ? "YES" : "NO";
    }
    return value === 1 ? "YES" : "NO";
};

/**
 * Onboarding step number -> label. Mirror of userShaper.onboardingLabel.
 */
export const onboardingLabel = (step: number): string => {
    switch (Number(step)) {
        case 1:
            return "REGISTERED";
        case 2:
            return "INFORMATION_UPDATED";
        case 3:
            return "DOCUMENTS_UPLOADED";
        case 4:
            return "ONBOARDING_COMPLETED";
        default:
            return "REGISTERED";
    }
};

/**
 * ID-verification status number -> label. Mirror of
 * userShaper.verificationLabel.
 */
export const verificationLabel = (status: number): string => {
    switch (status) {
        case 1:
            return "PENDING";
        case 2:
            return "INITIATED";
        case 3:
            return "PROCESSING";
        case 4:
            return "FAILED";
        case 5:
            return "COMPLETED";
        default:
            return "PENDING";
    }
};

/**
 * Tour status number -> label. Mirror of userShaper.tourLabel.
 */
export const tourLabel = (status: number): string => {
    return status === 1 ? "COMPLETED" : "PENDING";
};

/**
 * User role number -> label. Mirror of userShaper.roleLabel.
 */
export const roleLabel = (role: number | null): string => {
    if (role === null) {
        return "ADMIN";
    }
    switch (Number(role)) {
        case 1:
            return "ADMIN";
        case 2:
            return "OWNER";
        case 3:
            return "TEAM_MEMBER";
        case 4:
            return "CORPORATE";
        default:
            return "ADMIN";
    }
};

/**
 * Normalizes the many stored gender representations to
 * Male/Female/Others. Mirror of userShaper.genderFormatted.
 */
export const genderFormatted = (gender: string | null | undefined): string => {
    if (!gender) {
        return "";
    }
    const normalizedGender = gender.toLowerCase().trim();
    if (["male", "1", "m"].includes(normalizedGender)) {
        return "Male";
    }
    if (["female", "2", "f"].includes(normalizedGender)) {
        return "Female";
    }
    if (["others", "3", "o"].includes(normalizedGender)) {
        return "Others";
    }
    return gender;
};

/**
 * Date -> "YYYY-MM-DD" (empty string when null). Sequelize DATEONLY
 * columns already come back as strings, so both are accepted.
 */
export const toDateOnlyString = (
    date: Date | string | null | undefined,
): string => {
    if (!date) {
        return "";
    }
    if (typeof date === "string") {
        return date.split("T")[0];
    }
    return date.toISOString().split("T")[0];
};

/**
 * Human-readable relative time ("5 minutes ago"). Mirror of
 * lookupsService.relativeTime — used by fx-rate lookups.
 */
export const relativeTime = (date: Date): string => {
    const elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - date.getTime()) / 1000),
    );
    if (elapsedSeconds < 60) {
        return `${elapsedSeconds} seconds ago`;
    }

    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) {
        return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
    }

    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
        return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
    }

    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 30) {
        return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
    }

    const elapsedMonths = Math.floor(elapsedDays / 30);
    if (elapsedMonths < 12) {
        return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ago`;
    }

    const elapsedYears = Math.floor(elapsedMonths / 12);
    return `${elapsedYears} year${elapsedYears === 1 ? "" : "s"} ago`;
};

/**
 * Coarse status label the API exposes for a beneficiary transaction.
 * Mirror of helpers/constants.beneficiaryTransactionStatusLabel: every
 * in-flight provider/compliance state collapses to "PROCESSING" and the
 * terminal failure states collapse to "FAILED".
 */
export const beneficiaryTransactionStatusLabel = (
    value: number,
    _isTeam = false,
): string => {
    switch (value) {
        case BENEFICIARY_TRANSACTION_COMPLETED:
            return "COMPLETED";

        case BENEFICIARY_TRANSACTION_FAILED:
        case BENEFICIARY_TRANSACTION_EXPIRED:
        case BENEFICIARY_TRANSACTION_REJECTED:
        case BENEFICIARY_TRANSACTION_CANCELLED:
            return "FAILED";

        case BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL:
            return "WAITING_FOR_APPROVAL";

        case BENEFICIARY_TRANSACTION_CORPORATE_INITIATED:
            return "CORPORATE_INITIATED";

        default:
            return "PROCESSING";
    }
};

/**
 * Wallet status label. Mirror of walletStatusLabel().
 */
export const walletStatusLabel = (value: number): string => {
    return value === WALLET_STATUS_ACTIVE ? "ACTIVE" : "INACTIVE";
};

/**
 * Wallet transaction status label. Mirror of
 * walletTransactionStatusLabel().
 */
export const walletTransactionStatusLabel = (value: number): string => {
    switch (value) {
        case WALLET_TRANSACTION_COMPLETED:
            return "COMPLETED";
        case WALLET_TRANSACTION_FAILED:
        case WALLET_TRANSACTION_REJECTED:
        case WALLET_TRANSACTION_CANCELLED:
            return "FAILED";
        default:
            return "PENDING";
    }
};

/**
 * Virtual account status label. Mirror of virtualAccountStatusLabel().
 */
export const virtualAccountStatusLabel = (value: number): string => {
    switch (value) {
        case VIRTUAL_ACCOUNT_STATUS_PENDING:
            return "PENDING";
        case VIRTUAL_ACCOUNT_STATUS_CREATED:
            return "CREATED";
        case VIRTUAL_ACCOUNT_STATUS_FAILED:
            return "FAILED";
        default:
            return "PENDING";
    }
};

/**
 * Deposit transaction status label. Mirror of
 * depositTransactionStatusLabel(): all Processing-Unit states collapse
 * to "PROCESSING".
 */
export const depositTransactionStatusLabel = (value: number): string => {
    switch (value) {
        case DEPOSIT_TRANSACTION_COMPLETED:
            return "COMPLETED";
        case DEPOSIT_TRANSACTION_FAILED:
        case DEPOSIT_TRANSACTION_REJECTED:
            return "FAILED";
        default:
            return "PROCESSING";
    }
};

/**
 * Provider onboarding status label. Mirror of onboarding_status_label().
 */
export const onboardingStatusLabel = (value: number): string => {
    switch (value) {
        case ONBOARDING_STATUS_PENDING:
            return "PENDING";
        case ONBOARDING_STATUS_INITIATED:
            return "INITIATED";
        case ONBOARDING_STATUS_CREATED:
            return "CREATED";
        case ONBOARDING_STATUS_FAILED:
            return "FAILED";
        default:
            return "PENDING";
    }
};
