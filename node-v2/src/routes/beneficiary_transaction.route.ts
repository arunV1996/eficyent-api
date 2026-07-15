import { Router } from "express";
import multer from "multer";
import {
    bulkStore,
    cancel,
    checkStatus,
    checkTransactionStatus,
    direct,
    downloadList,
    getFormFields,
    getProof,
    index,
    instant,
    instantGetFormFields,
    payoutTemplate,
    requestProof,
    show,
    store,
    transactionFormFields,
    updateStatus,
} from "../controller/beneficiary_transaction.controller";
import { beneficiaryTransactionApiRoutes } from "../utils/api.routes";

const router = Router();

// Route-level multipart parsing for the bulk-store upload only — the
// global middleware chain stays JSON/base64, so no other endpoint is
// affected. The XLSX arrives as the `file` field (or a base64 data URL
// on the JSON body, handled in the controller).
const bulkUpload = multer({ storage: multer.memoryStorage() });

router.get(
    beneficiaryTransactionApiRoutes.LIST.path,
    ...beneficiaryTransactionApiRoutes.LIST.middleware,
    index,
);

router.post(
    beneficiaryTransactionApiRoutes.STORE.path,
    ...beneficiaryTransactionApiRoutes.STORE.middleware,
    store,
);

router.get(
    beneficiaryTransactionApiRoutes.SHOW.path,
    ...beneficiaryTransactionApiRoutes.SHOW.middleware,
    show,
);

router.get(
    beneficiaryTransactionApiRoutes.CHECK_TRANSACTION_STATUS.path,
    ...beneficiaryTransactionApiRoutes.CHECK_TRANSACTION_STATUS.middleware,
    checkTransactionStatus,
);

router.get(
    beneficiaryTransactionApiRoutes.CHECK_STATUS.path,
    ...beneficiaryTransactionApiRoutes.CHECK_STATUS.middleware,
    checkStatus,
);

router.post(
    beneficiaryTransactionApiRoutes.UPDATE_STATUS.path,
    ...beneficiaryTransactionApiRoutes.UPDATE_STATUS.middleware,
    updateStatus,
);

router.post(
    beneficiaryTransactionApiRoutes.CANCEL.path,
    ...beneficiaryTransactionApiRoutes.CANCEL.middleware,
    cancel,
);

router.get(
    beneficiaryTransactionApiRoutes.GET_FORM_FIELDS.path,
    ...beneficiaryTransactionApiRoutes.GET_FORM_FIELDS.middleware,
    getFormFields,
);

router.get(
    beneficiaryTransactionApiRoutes.TRANSACTION_FORM_FIELDS.path,
    ...beneficiaryTransactionApiRoutes.TRANSACTION_FORM_FIELDS.middleware,
    transactionFormFields,
);

router.post(
    beneficiaryTransactionApiRoutes.DIRECT.path,
    ...beneficiaryTransactionApiRoutes.DIRECT.middleware,
    direct,
);

router.get(
    beneficiaryTransactionApiRoutes.INSTANT_GET_FORM_FIELDS.path,
    ...beneficiaryTransactionApiRoutes.INSTANT_GET_FORM_FIELDS.middleware,
    instantGetFormFields,
);

router.post(
    beneficiaryTransactionApiRoutes.INSTANT_STORE.path,
    ...beneficiaryTransactionApiRoutes.INSTANT_STORE.middleware,
    instant,
);

router.post(
    beneficiaryTransactionApiRoutes.REQUEST_PROOF.path,
    ...beneficiaryTransactionApiRoutes.REQUEST_PROOF.middleware,
    requestProof,
);

router.get(
    beneficiaryTransactionApiRoutes.GET_PROOF.path,
    ...beneficiaryTransactionApiRoutes.GET_PROOF.middleware,
    getProof,
);

router.get(
    beneficiaryTransactionApiRoutes.BULK_TEMPLATE.path,
    ...beneficiaryTransactionApiRoutes.BULK_TEMPLATE.middleware,
    payoutTemplate,
);

router.post(
    beneficiaryTransactionApiRoutes.BULK_STORE.path,
    ...beneficiaryTransactionApiRoutes.BULK_STORE.middleware,
    bulkUpload.single("file"),
    bulkStore,
);

router.get(
    beneficiaryTransactionApiRoutes.DOWNLOAD.path,
    ...beneficiaryTransactionApiRoutes.DOWNLOAD.middleware,
    downloadList,
);

export default router;
