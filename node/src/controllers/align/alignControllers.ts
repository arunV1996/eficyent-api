import { Request, Response } from "express";
import { sendResponse } from "../../helpers/response";
import { apiSuccess } from "../../helpers/messages";
import { Dispatch } from "../../queues/dispatchers";

/**
 * Mirror of:
 *   - App\\Http\\Controllers\\Api\\ComplianceAlignController
 *   - App\\Http\\Controllers\\Api\\RemittanceAlignController
 *
 * Both endpoints are operator-triggered and queue a batch job that
 * walks beneficiary_transactions in chunks. Returning 200 the moment
 * the job is enqueued mirrors Laravel exactly.
 *
 * Note: these endpoints are public in Laravel (no auth on the
 * /compliance/align or /stable-coin-remittance/align routes). We
 * preserve that behaviour but recommend deploying behind WAF / IP
 * allowlist - they kick off external-service traffic.
 */
export const complianceAlignController = {
  async invoke(_req: Request, res: Response): Promise<Response> {
    await Dispatch.complianceBatch({ triggeredBy: "api" });
    return sendResponse(res, apiSuccess(116), 116, []);
  },
};

export const remittanceAlignController = {
  async invoke(_req: Request, res: Response): Promise<Response> {
    await Dispatch.remittanceBatch({ triggeredBy: "api" });
    return sendResponse(res, apiSuccess(117), 117, []);
  },
};
