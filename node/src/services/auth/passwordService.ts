import bcrypt from "bcryptjs";

/**
 * Standard Bcrypt password hashing.
 * Matches Laravel's default Bcrypt password hashing behavior.
 * Uses bcryptjs for cross-platform safety.
 */

export const passwordService = {
  /**
   * Hashes a plaintext password using standard Bcrypt with 10 rounds.
   * The prefix is rewritten to Laravel's $2y$ variant: Laravel's
   * BcryptHasher rejects $2a$/$2b$ hashes with "This password does not
   * use the Bcrypt algorithm", while verify() below normalizes $2y$
   * back to $2a$ for bcryptjs.
   */
  async hash(plain: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(plain, salt);
    return hash.replace(/^\$2[ab]\$/, "$2y$");
  },

  /**
   * Verifies a plaintext password against a stored Bcrypt hash.
   * Supports both Laravel format ($2y$) and JS format ($2a$/$2b$).
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    if (!hash) return false;
    // Replace $2y$ from Laravel with $2a$ so bcryptjs can parse and verify it
    const normalizedHash = hash.replace(/^\$2y\$/, "$2a$");
    return bcrypt.compare(plain, normalizedHash);
  },

  /**
   * Verify and return status. Never upgrades or rehashes to Argon.
   */
  async verifyAndUpgrade(
    hash: string,
    plain: string,
  ): Promise<{ valid: boolean; rehash?: string }> {
    const valid = await this.verify(hash, plain);
    return { valid };
  },
};
