import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_FVBANK,
} from "../../helpers/constants";
import { Caliza } from "./caliza";
import { FvBank } from "./fvBank";

/**
 * Mirror of App\\Factories\\Onboarding\\OnboardingFactory.
 *
 * Phase 8a: real implementations registered. The provider drivers
 * themselves manage user_services row state (INITIATED -> CREATED/FAILED)
 * and write external_service_calls audit rows.
 */

interface OnboardingDriver {
  make(user: User): Promise<void>;
}

class CalizaOnboardingDriver implements OnboardingDriver {
  async make(user: User): Promise<void> {
    await Caliza.onboard(user);
  }
}

class FvBankOnboardingDriver implements OnboardingDriver {
  async make(user: User): Promise<void> {
    await FvBank.onboard(user);
  }
}

export const OnboardingFactory = {
  resolve(serviceType: string): OnboardingDriver {
    switch (serviceType) {
      case EXTERNAL_TYPE_CALIZA:
        return new CalizaOnboardingDriver();
      case EXTERNAL_TYPE_FVBANK:
        return new FvBankOnboardingDriver();
      default:
        throw new ApiException(113);
    }
  },
};
