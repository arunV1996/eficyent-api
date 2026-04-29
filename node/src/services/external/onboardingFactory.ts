import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import { logger } from "../../helpers/logger";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_FVBANK,
  ONBOARDING_STATUS_INITIATED,
} from "../../helpers/constants";
import { prisma } from "../../db/prisma";
import { uniqueId } from "../../helpers/uniqueId";

/**
 * Mirror of App\\Factories\\Onboarding\\OnboardingFactory + the per-provider
 * onboarding services (CalizaOnboarding, FvBankOnboarding).
 *
 * The full external HTTP call chain is wired up in Phase 8. Phase 3 only
 * needs the provider to *initiate* onboarding - we record a UserService row
 * with status=INITIATED, which the activate flow uses to gate retries.
 */

interface OnboardingDriver {
  make(user: User): Promise<void>;
}

class StubOnboarding implements OnboardingDriver {
  constructor(private serviceType: string) {}

  async make(user: User): Promise<void> {
    await prisma().userService.upsert({
      where: { userId_serviceType: { userId: user.id, serviceType: this.serviceType } },
      create: {
        uniqueId: uniqueId(24),
        userId: user.id,
        serviceType: this.serviceType,
        status: String(ONBOARDING_STATUS_INITIATED),
        isActive: 1,
      },
      update: { status: String(ONBOARDING_STATUS_INITIATED), isActive: 1 },
    });
    logger.info(
      { userId: user.id.toString(), provider: this.serviceType },
      "Onboarding initiated (stub - external HTTP call lands in Phase 8)",
    );
  }
}

export const OnboardingFactory = {
  resolve(serviceType: string): OnboardingDriver {
    switch (serviceType) {
      case EXTERNAL_TYPE_CALIZA:
      case EXTERNAL_TYPE_FVBANK:
        return new StubOnboarding(serviceType);
      default:
        throw new ApiException(113);
    }
  },
};
