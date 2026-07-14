import { Router } from "express";
import {
    cancel,
    checkStatus,
    checkTransactionStatus,
    getProof,
    index,
    requestProof,
    show,
    store,
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

export default router;
