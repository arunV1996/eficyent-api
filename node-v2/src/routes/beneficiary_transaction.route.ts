import { Router } from "express";
import {
    bulkStore,
    cancel,
    checkStatus,
    checkTransactionStatus,
    direct,
    downloadList,
    exportMultipleReceipts,
    exportReceipt,
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
    bulkStore,
);

router.get(
    beneficiaryTransactionApiRoutes.DOWNLOAD.path,
    ...beneficiaryTransactionApiRoutes.DOWNLOAD.middleware,
    downloadList,
);

router.get(
    beneficiaryTransactionApiRoutes.EXPORT.path,
    ...beneficiaryTransactionApiRoutes.EXPORT.middleware,
    exportReceipt,
);

router.post(
    beneficiaryTransactionApiRoutes.EXPORT_MULTIPLE.path,
    ...beneficiaryTransactionApiRoutes.EXPORT_MULTIPLE.middleware,
    exportMultipleReceipts,
);

export default router;
