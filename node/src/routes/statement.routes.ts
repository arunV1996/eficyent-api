import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authSanctum, emailShouldBeVerified } from "../middleware/auth";
import {
    onboardingShouldBeCompleted,
    validateMerchant,
} from "../middleware/access";
import { validate } from "../middleware/validateRequest";
import { z } from "zod";
import { statementController } from "../controllers/statement/statementController";

export const StatementExportSchema = z.object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
    bank_account_id: z.string(),
});

export function statementRoutes(): Router {
    const r = Router();
    r.use(
        asyncHandler(authSanctum),
        asyncHandler(validateMerchant),
        emailShouldBeVerified,
        onboardingShouldBeCompleted,
    );
    r.get(
        "/export",
        validate({ query: StatementExportSchema }),
        asyncHandler(statementController.export),
    );
    return r;
}
