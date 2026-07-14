import { Router } from "express";
import {
    countries,
    depositLookups,
    mobileCountryCodes,
    paymentRails,
    states,
} from "../controller/lookup.controller";
import { lookupApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    lookupApiRoutes.MOBILE_COUNTRY_CODES.path,
    ...lookupApiRoutes.MOBILE_COUNTRY_CODES.middleware,
    mobileCountryCodes,
);

router.get(
    lookupApiRoutes.COUNTRIES.path,
    ...lookupApiRoutes.COUNTRIES.middleware,
    countries,
);

router.get(
    lookupApiRoutes.STATES.path,
    ...lookupApiRoutes.STATES.middleware,
    states,
);

router.get(
    lookupApiRoutes.PAYMENT_RAILS.path,
    ...lookupApiRoutes.PAYMENT_RAILS.middleware,
    paymentRails,
);

router.get(
    lookupApiRoutes.DEPOSIT_LOOKUPS.path,
    ...lookupApiRoutes.DEPOSIT_LOOKUPS.middleware,
    depositLookups,
);

export default router;
