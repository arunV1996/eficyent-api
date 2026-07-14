import { Router } from "express";
import {
    getFormFields,
    stepThree,
    stepTwo,
} from "../controller/onboarding.controller";
import { onboardingApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    onboardingApiRoutes.GET_FORM_FIELDS.path,
    ...onboardingApiRoutes.GET_FORM_FIELDS.middleware,
    getFormFields,
);

router.post(
    onboardingApiRoutes.STEP_TWO.path,
    ...onboardingApiRoutes.STEP_TWO.middleware,
    stepTwo,
);

router.post(
    onboardingApiRoutes.STEP_THREE.path,
    ...onboardingApiRoutes.STEP_THREE.middleware,
    stepThree,
);

export default router;
