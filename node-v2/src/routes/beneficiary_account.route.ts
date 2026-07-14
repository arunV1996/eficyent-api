import { Router } from "express";
import {
    destroy,
    getFormFields,
    index,
    show,
    store,
    validateAccount,
} from "../controller/beneficiary_account.controller";
import { beneficiaryApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    beneficiaryApiRoutes.GET_FORM_FIELDS.path,
    ...beneficiaryApiRoutes.GET_FORM_FIELDS.middleware,
    getFormFields,
);

router.get(
    beneficiaryApiRoutes.LIST.path,
    ...beneficiaryApiRoutes.LIST.middleware,
    index,
);

router.get(
    beneficiaryApiRoutes.SHOW.path,
    ...beneficiaryApiRoutes.SHOW.middleware,
    show,
);

router.post(
    beneficiaryApiRoutes.STORE.path,
    ...beneficiaryApiRoutes.STORE.middleware,
    store,
);

router.post(
    beneficiaryApiRoutes.VALIDATE_ACCOUNT.path,
    ...beneficiaryApiRoutes.VALIDATE_ACCOUNT.middleware,
    validateAccount,
);

router.delete(
    beneficiaryApiRoutes.DELETE.path,
    ...beneficiaryApiRoutes.DELETE.middleware,
    destroy,
);

export default router;
