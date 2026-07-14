/**
 * Error carrying the legacy {success:false, error, error_code}
 * envelope parameters. Controllers catch CodedError and emit
 * res.sendError(message, errorCode, httpStatus).
 */
export class CodedError extends Error {
    public readonly errorCode: number;
    public readonly httpStatus: number;

    constructor(message: string, errorCode = 422, httpStatus = 422) {
        super(message);
        this.name = "CodedError";
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }
}
