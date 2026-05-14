import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_FVBANK,
  ONBOARDING_STATUS_PENDING,
} from "./constants";

/**
 * Mirror of available_banks() from ViewHelper.php. Returns the catalogue of
 * onboarding providers a user can activate a virtual account on. Each entry
 * is augmented with a default status of PENDING which the controller fills
 * in from user_services rows + virtual_accounts.
 */

export interface AvailableBank {
  key: string;
  value: string;
  currency: string;
  status: number;
}

export function availableBanks(): AvailableBank[] {
  return [
    { key: EXTERNAL_TYPE_CALIZA, value: "Cross River bank", currency: "USD", status: ONBOARDING_STATUS_PENDING },
    { key: EXTERNAL_TYPE_FVBANK, value: "FV Bank", currency: "USD", status: ONBOARDING_STATUS_PENDING },
  ];
}
