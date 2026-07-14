import { Request, Response } from "express";
import { fetchStatementData } from "../helpers/statement.helper";
import { temporaryUrl, upload } from "../services/s3.service";
import { generateStatementExcel } from "../utils/excel_generator.utils";

/**
 * Mirror of the legacy statementController — builds the two-sheet XLSX
 * account statement, uploads it to S3 and returns the signed URL.
 *
 * The legacy error branches use their own raw envelopes
 * ({success:false, message, code:"", data:null} with 404/500), so they
 * are emitted verbatim here rather than through sendError.
 *
 * Deferred with the team module: the effective-user resolution for
 * team-member tokens (the effective user is always req.user here).
 */

/**
 * GET /api/user/statement/export
 */
export const exportStatement = async (
    req: Request,
    res: Response,
): Promise<void> => {
    let { from_date: fromDate, to_date: toDate } = req.query as {
        from_date?: string;
        to_date?: string;
    };
    const bankAccountId = String(req.query.bank_account_id);

    try {
        if (!req.user) {
            return res.sendError(res.__("102"), 102, 400);
        }

        if (!fromDate || !toDate) {
            const now = new Date();
            const past = new Date();
            past.setDate(now.getDate() - 31);

            if (!toDate) {
                toDate = now.toISOString().split("T")[0];
            }
            if (!fromDate) {
                fromDate = past.toISOString().split("T")[0];
            }
        }

        const data = await fetchStatementData({
            user: req.user,
            userId: req.user.id,
            from_date: fromDate!,
            to_date: toDate!,
            bank_account_id: bankAccountId,
        });

        const buffer = await generateStatementExcel(data);

        const url = await upload(
            {
                buffer,
                contentType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                extension: "xlsx",
            },
            "exports/statements",
        );
        const signedUrl = await temporaryUrl(url);

        res.status(200).json({
            success: true,
            message: "Statement exported successfully",
            code: "",
            data: { url: signedUrl },
        });
        return;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        if (errorMessage === "Virtual account not found or unauthorized") {
            res.status(404).json({
                success: false,
                message: errorMessage,
                code: "",
                data: null,
            });
            return;
        }
        // eslint-disable-next-line no-console
        console.error("Export statement error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            code: "",
            data: null,
        });
        return;
    }
};
