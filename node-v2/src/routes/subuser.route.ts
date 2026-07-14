import { Router } from "express";
import {
    acceptInvite,
    destroy,
    index,
    show,
    store,
} from "../controller/subuser.controller";
import { subuserApiRoutes } from "../utils/api.routes";

const router = Router();

// Public (anonymous) invite acceptance.
router.post(
    subuserApiRoutes.ACCEPT_INVITE.path,
    ...subuserApiRoutes.ACCEPT_INVITE.middleware,
    acceptInvite,
);

router.get(
    subuserApiRoutes.LIST.path,
    ...subuserApiRoutes.LIST.middleware,
    index,
);

router.post(
    subuserApiRoutes.STORE.path,
    ...subuserApiRoutes.STORE.middleware,
    store,
);

router.get(
    subuserApiRoutes.SHOW.path,
    ...subuserApiRoutes.SHOW.middleware,
    show,
);

router.delete(
    subuserApiRoutes.DELETE.path,
    ...subuserApiRoutes.DELETE.middleware,
    destroy,
);

export default router;
