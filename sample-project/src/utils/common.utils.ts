import bcrypt from "bcryptjs";
import moment from "moment-timezone";
import jwt from "jsonwebtoken";

/**
 * Hashes a plain text password using bcrypt.
 * @param password The plain text password to hash
 * @returns A promise that resolves to the hashed password string
 */
export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

/**
 * Compares a plain text password with a hashed password.
 * @param password The plain text password
 * @param hash The hashed password
 * @returns A promise that resolves to true if they match, false otherwise
 */
export const comparePassword = async (
    password: string,
    hash: string,
): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};

/**
 * Formats a Date object or date string into the format: "12 Feb 2026 1:22 PM".
 * @param date The date to format
 * @param timezone Optional timezone (defaults to UTC)
 * @returns The formatted date string
 */
export const formatDate = (
    date: Date | string,
    timezone: string = "UTC",
): string => {
    if (!date) return "";
    let tz = timezone;
    if (tz?.includes("Calcutta")) {
        tz = "Asia/Kolkata";
    }
    return moment.utc(date).tz(tz).format("D MMM YYYY h:mm A");
};

/**
 * Generates a JWT access token for a given user ID.
 * @param userId The user ID to include in the payload
 * @returns A promise that resolves to the signed JWT token string
 */
export const generateToken = async (userId: number): Promise<string> => {
    const secret = process.env.JWT_SECRET || "default_secret";
    return jwt.sign({ userId }, secret, { expiresIn: "7d" });
};
