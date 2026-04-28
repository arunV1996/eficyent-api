import { Response } from "express";
import { apiError, apiSuccess } from "./messages";

/**
 * Response shape mirrors Laravel sendResponse / sendError exactly so the
 * existing frontend and white-label consumers continue to work without
 * any change.
 *
 *   {
 *     "status": true | false,
 *     "code":   <int>,
 *     "message": "...",
 *     "data":   <object | array | null>
 *   }
 */

export interface ApiEnvelope<T = unknown> {
  status: boolean;
  code: number;
  message: string;
  data: T | null;
}

export function sendResponse<T>(
  res: Response,
  message: string | undefined,
  code: number,
  data: T | null = null,
  httpStatus = 200,
): Response {
  const envelope: ApiEnvelope<T> = {
    status: true,
    code,
    message: message || apiSuccess(code),
    data,
  };
  return res.status(httpStatus).json(envelope);
}

export function sendError(
  res: Response,
  message: string | undefined,
  code: number,
  httpStatus = 400,
): Response {
  const envelope: ApiEnvelope<null> = {
    status: false,
    code,
    message: message || apiError(code),
    data: null,
  };
  return res.status(httpStatus).json(envelope);
}
