import { User } from "@prisma/client";
import { ApiException } from "../../helpers/errors";
import {
  EXTERNAL_TYPE_CALIZA,
  EXTERNAL_TYPE_FVBANK,
} from "../../helpers/constants";
import { Caliza } from "./caliza";
import { FvBank } from "./fvBank";

/**
 * Mirror of App\\Factories\\VirtualAccounts\\VirtualAccountFactory.
 *
 * Phase 8a: real implementations registered. Caliza synchronously
 * provisions in sandbox / asynchronously via webhook in production;
 * FvBank is webhook-only (Phase 9 lands the webhook handler).
 */

interface VirtualAccountDriver {
  make(user: User): Promise<void>;
}

class CalizaVirtualAccountDriver implements VirtualAccountDriver {
  async make(user: User): Promise<void> {
    await Caliza.createVirtualAccount(user);
  }
}

class FvBankVirtualAccountDriver implements VirtualAccountDriver {
  async make(user: User): Promise<void> {
    await FvBank.createVirtualAccount(user);
  }
}

export const VirtualAccountFactory = {
  resolve(serviceType: string): VirtualAccountDriver {
    switch (serviceType) {
      case EXTERNAL_TYPE_CALIZA:
        return new CalizaVirtualAccountDriver();
      case EXTERNAL_TYPE_FVBANK:
        return new FvBankVirtualAccountDriver();
      default:
        throw new ApiException(113);
    }
  },
};
