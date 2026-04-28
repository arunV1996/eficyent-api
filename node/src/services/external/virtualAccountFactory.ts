import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import { logger } from "../../helpers/logger";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_FVBANK,
} from "../../helpers/constants";

/**
 * Mirror of App\\Factories\\VirtualAccounts\\VirtualAccountFactory. The
 * actual virtual-account creation hits the provider API; in Phase 3 we
 * record an audit log and let the provider's webhook + onboarding callback
 * (Phase 9) populate virtual_accounts rows asynchronously.
 */

interface VirtualAccountDriver {
  make(user: User): Promise<void>;
}

class StubVirtualAccount implements VirtualAccountDriver {
  constructor(private serviceType: string) {}

  async make(user: User): Promise<void> {
    logger.info(
      { userId: user.id.toString(), provider: this.serviceType },
      "Virtual account creation requested (stub - external HTTP + webhook flow lands in Phase 8/9)",
    );
  }
}

export const VirtualAccountFactory = {
  resolve(serviceType: string): VirtualAccountDriver {
    switch (serviceType) {
      case EXTERNAL_TYPE_CALIZA:
      case EXTERNAL_TYPE_FVBANK:
        return new StubVirtualAccount(serviceType);
      default:
        throw new ApiException(113);
    }
  },
};
