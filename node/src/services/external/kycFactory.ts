import { ApiException } from "../../helpers/errors";
import {
  ID_VERIFIED_BY_HERALD_SUMSUB,
  ID_VERIFIED_BY_INCODE,
} from "../../helpers/constants";
import { KycDriver } from "./kycContract";
import { HeraldSumsub } from "./heraldSumsubKyc";
import { Incode } from "./incodeKyc";

/**
 * Mirror of App\\Factories\\Kyc\\KycFactory.
 *
 *   ID_VERIFIED_BY_HERALD_SUMSUB ('hs') -> HeraldSumsub
 *   ID_VERIFIED_BY_INCODE        ('ic') -> Incode
 *
 * Surepass is registered as a *bank validation* provider (not a KYC
 * provider) in the upstream Laravel code, so it's not part of this
 * factory.
 */
export const KycFactory = {
  resolve(serviceTag: string): KycDriver {
    switch (serviceTag) {
      case ID_VERIFIED_BY_HERALD_SUMSUB:
        return HeraldSumsub;
      case ID_VERIFIED_BY_INCODE:
        return Incode;
      default:
        throw new ApiException(113);
    }
  },
};
