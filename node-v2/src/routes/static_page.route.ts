import { Router } from "express";
import { index, show } from "../controller/static_page.controller";
import { staticPageApiRoutes } from "../utils/api.routes";

const router = Router();

router.get(
    staticPageApiRoutes.LIST.path,
    ...staticPageApiRoutes.LIST.middleware,
    index,
);

router.get(
    staticPageApiRoutes.SHOW.path,
    ...staticPageApiRoutes.SHOW.middleware,
    show,
);

export default router;
