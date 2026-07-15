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
    update,
} from "../controller/sender.controller";
import { senderApiRoutes } from "../utils/api.routes";

const router = Router();

// Route-level multipart parsing for the bulk-store upload only.
const bulkUpload = multer({ storage: multer.memoryStorage() });

router.get(
    senderApiRoutes.GET_FORM_FIELDS.path,
    ...senderApiRoutes.GET_FORM_FIELDS.middleware,
    getFormFields,
);

router.get(senderApiRoutes.LIST.path, ...senderApiRoutes.LIST.middleware, index);

router.post(
    senderApiRoutes.STORE.path,
    ...senderApiRoutes.STORE.middleware,
    store,
);

router.post(
    senderApiRoutes.UPDATE.path,
    ...senderApiRoutes.UPDATE.middleware,
    update,
);

router.get(senderApiRoutes.SHOW.path, ...senderApiRoutes.SHOW.middleware, show);

router.delete(
    senderApiRoutes.DELETE.path,
    ...senderApiRoutes.DELETE.middleware,
    destroy,
);

router.get(
    senderApiRoutes.BULK_TEMPLATE.path,
    ...senderApiRoutes.BULK_TEMPLATE.middleware,
    bulkTemplate,
);

router.post(
    senderApiRoutes.BULK_STORE.path,
    ...senderApiRoutes.BULK_STORE.middleware,
    bulkUpload.single("file"),
    bulkStore,
);

export default router;
