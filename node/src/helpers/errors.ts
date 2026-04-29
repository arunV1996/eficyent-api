import { apiError } from "./messages";

/**
 * Mirror of Laravel `throw new Exception(api_error(N), N)` pattern.
 * Carries an http status code in addition to the API error code so the
 * error handler can map them appropriately (e.g. 401 vs 422 vs 500).
 */
export class ApiException extends Error {
  public readonly code: number;
  public readonly httpStatus: number;
  public readonly cause?: unknown;

  constructor(code: number, message?: string, httpStatus = 400, cause?: unknown) {
    super(message ?? apiError(code));
    this.name = "ApiException";
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

export function throwIf(condition: unknown, code: number, message?: string, httpStatus = 400): void {
  if (condition) throw new ApiException(code, message, httpStatus);
}

export class ValidationException extends ApiException {
  public readonly fieldErrors: Record<string, string[]>;
  constructor(fieldErrors: Record<string, string[]>) {
    super(422, "Validation error.", 422);
    this.fieldErrors = fieldErrors;
    this.name = "ValidationException";
  }
}
