import { Router } from "express";
import multer from "multer";
import {
    bulkStore,
    bulkTemplate,
    destroy,
    getFormFields,
    index,
    show,
    store,
    validateAccount,
} from "../controller/beneficiary_account.controller";
import { beneficiaryApiRoutes } from "../utils/api.routes";

const router = Router();

// Route-level multipart parsing for the bulk-store upload only.
const bulkUpload = multer({ storage: multer.memoryStorage() });

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

router.get(
    beneficiaryApiRoutes.BULK_TEMPLATE.path,
    ...beneficiaryApiRoutes.BULK_TEMPLATE.middleware,
    bulkTemplate,
);

router.post(
    beneficiaryApiRoutes.BULK_STORE.path,
    ...beneficiaryApiRoutes.BULK_STORE.middleware,
    bulkUpload.single("file"),
    bulkStore,
);

export default router;
