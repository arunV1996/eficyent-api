import { customAlphabet, nanoid } from "nanoid";

/** URL-safe random id, 21 chars by default. */
export const uniqueId = (size = 21): string => nanoid(size);

const numericAlphabet = "0123456789";
const numericNano = customAlphabet(numericAlphabet, 16);

/**
 * Generate a transaction reference number compatible with Laravel's
 * `Helper::generateTransactionRefNumber` shape: <padded id><timestamp><rand>.
 * The padded id is always 2 characters; callers pass the merchant or user id.
 */
export function generateTransactionRefNumber(scopeId: number | bigint): string {
  const id = String(scopeId).padStart(2, "0").slice(-2);
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const HH = String(now.getUTCHours()).padStart(2, "0");
  const MM = String(now.getUTCMinutes()).padStart(2, "0");
  const SS = String(now.getUTCSeconds()).padStart(2, "0");
  const ms = String(now.getUTCMilliseconds()).padStart(3, "0");
  const rand = numericNano(3);
  return `${id}${yyyy}${mm}${dd}${HH}${MM}${SS}${ms}${rand}`;
}

/**
 * 6-digit numeric email/2FA code.
 */
export function generateEmailCode(): string {
  return numericNano(6);
}
