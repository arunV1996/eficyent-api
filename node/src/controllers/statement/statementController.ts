import { Request, Response } from "express";
import { statementService } from "../../services/statement/statementService";
import { generateStatementExcel } from "../../utils/excelGenerator";
import { getEffectiveUserId } from "../../utils/userHelper";

export const statementController = {
    async export(req: Request, res: Response) {
        let { from_date, to_date, bank_account_id } = req.query as {
            from_date?: string;
            to_date?: string;
            bank_account_id: string;
        };

        try {
            const effectiveUserId = getEffectiveUserId(req);

            if (!from_date || !to_date) {
                const now = new Date();
                const past = new Date();
                past.setDate(now.getDate() - 31);
                
                if (!to_date) {
                    to_date = now.toISOString().split('T')[0];
                }
                if (!from_date) {
                    from_date = past.toISOString().split('T')[0];
                }
            }

            const data = await statementService.fetchStatementData({
                user: req.user!,
                userId: effectiveUserId,
                from_date: from_date!,
                to_date: to_date!,
                bank_account_id,
            });

            const buffer = await generateStatementExcel(data);

            const { s3Service } = await import("../../services/storage/s3Service");
            const url = await s3Service.upload(
                { buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
                "exports/statements",
            );
            const signedUrl = await s3Service.temporaryUrl(url);

            return res.status(200).json({ success: true, message: "Statement exported successfully", code: "", data: { url: signedUrl } });
        } catch (e: any) {
            if (e.message === "Virtual account not found or unauthorized") {
                return res.status(404).json({ success: false, message: e.message, code: "", data: null });
            }
            console.error("Export statement error:", e);
            return res.status(500).json({ success: false, message: "Something went wrong", code: "", data: null });
        }
    },
};
