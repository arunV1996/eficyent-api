import { User } from "@prisma/client";

/**
 * Mirror of App\\Contracts\\Kyc\\KycContract. Each KYC provider implements
 * make() (start a verification) and status() (poll-and-update).
 *
 * make() returns the redirect URL the user must visit to complete the
 * flow (or an empty string if the provider auto-starts in the
 * background and notifies via webhook).
 *
 * status() polls the provider for the current verification result and
 * updates the user row (id_verification, id_verified_by, optionally
 * onboarding_step).
 */
export interface KycDriver {
  make(user: User): Promise<string>;
  status(user: User): Promise<void>;
}
