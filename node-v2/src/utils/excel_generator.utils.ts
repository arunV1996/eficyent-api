import ExcelJS from "exceljs";
import {
    BENEFICIARY_TRANSACTION_APPROVED,
    BENEFICIARY_TRANSACTION_CANCELLED,
    BENEFICIARY_TRANSACTION_COMPLETED,
    BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED,
    BENEFICIARY_TRANSACTION_CORPORATE_INITIATED,
    BENEFICIARY_TRANSACTION_EXPIRED,
    BENEFICIARY_TRANSACTION_FAILED,
    BENEFICIARY_TRANSACTION_INITIATED,
    BENEFICIARY_TRANSACTION_REJECTED,
    BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL,
    DEPOSIT_TRANSACTION_COMPLETED,
    DEPOSIT_TRANSACTION_FAILED,
    DEPOSIT_TRANSACTION_PENDING,
    DEPOSIT_TRANSACTION_REJECTED,
    WALLET_TRANSACTION_CANCELLED,
    WALLET_TRANSACTION_COMPLETED,
    WALLET_TRANSACTION_FAILED,
    WALLET_TRANSACTION_REJECTED,
} from "./constants";
import type { StatementData } from "../helpers/statement.helper";

/**
 * Mirror of the legacy utils/excelGenerator.ts — builds the two-sheet
 * statement workbook (Summary + Transactions). Formatting is kept
 * byte-identical so the exported files match the legacy service.
 */

/**
 * Statement-specific status labels: the report shows each terminal
 * state exactly (REJECTED / CANCELLED / EXPIRED stay distinct instead
 * of collapsing into FAILED, compliance rejection reads REJECTED), and
 * every in-flight internal state reads PROCESSING.
 */
const statementPayoutStatusLabel = (value: number): string => {
    switch (value) {
        case BENEFICIARY_TRANSACTION_WAITING_FOR_APPROVAL:
            return "WAITING_FOR_APPROVAL";
        case BENEFICIARY_TRANSACTION_APPROVED:
            return "APPROVED";
        case BENEFICIARY_TRANSACTION_INITIATED:
            return "INITIATED";
        case BENEFICIARY_TRANSACTION_COMPLETED:
            return "COMPLETED";
        case BENEFICIARY_TRANSACTION_FAILED:
            return "FAILED";
        case BENEFICIARY_TRANSACTION_EXPIRED:
            return "EXPIRED";
        case BENEFICIARY_TRANSACTION_REJECTED:
        case BENEFICIARY_TRANSACTION_COMPLIANCE_REJECTED:
            return "REJECTED";
        case BENEFICIARY_TRANSACTION_CANCELLED:
            return "CANCELLED";
        case BENEFICIARY_TRANSACTION_CORPORATE_INITIATED:
            return "CORPORATE_INITIATED";
        default:
            return "PROCESSING";
    }
};

const statementDepositStatusLabel = (value: number): string => {
    switch (value) {
        case DEPOSIT_TRANSACTION_PENDING:
            return "PENDING";
        case DEPOSIT_TRANSACTION_COMPLETED:
            return "COMPLETED";
        case DEPOSIT_TRANSACTION_FAILED:
            return "FAILED";
        case DEPOSIT_TRANSACTION_REJECTED:
            return "REJECTED";
        default:
            return "PROCESSING";
    }
};

const statementWalletStatusLabel = (value: number): string => {
    switch (value) {
        case WALLET_TRANSACTION_COMPLETED:
            return "COMPLETED";
        case WALLET_TRANSACTION_FAILED:
            return "FAILED";
        case WALLET_TRANSACTION_REJECTED:
            return "REJECTED";
        case WALLET_TRANSACTION_CANCELLED:
            return "CANCELLED";
        default:
            return "PENDING";
    }
};

/**
 * "YYYY-MM-DD HH:mm:ss" in the statement owner's timezone (sv-SE
 * locale yields exactly that shape) — the export previously printed
 * raw UTC, which never matched the localized times shown in the UI.
 */
const formatStatementTimestamp = (
    value: Date | string | null | undefined,
    timezone: string,
): string => {
    if (!value) {
        return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }
    try {
        return parsed.toLocaleString("sv-SE", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
    } catch {
        return parsed.toISOString().replace("T", " ").substring(0, 19);
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateStatementExcel(data: StatementData | any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Eficyent System";
    workbook.created = new Date();

    // --- Sheet 1: Summary ---
    const summarySheet = workbook.addWorksheet("Summary");
    // Define columns for merging up to column G (7 columns)
    summarySheet.columns = [
        { key: "col1", width: 25 },
        { key: "col2", width: 15 },
        { key: "col3", width: 20 },
        { key: "col4", width: 20 },
        { key: "col5", width: 20 },
        { key: "col6", width: 20 },
        { key: "col7", width: 25 },
    ];

    summarySheet.addRow(["Statement Of Account"]);
    summarySheet.mergeCells("A1:G1");
    summarySheet.getCell("A1").alignment = { horizontal: "center" };
    summarySheet.getCell("A1").font = { bold: true, size: 14 };

    summarySheet.addRow([data.metadata.accountHolderName]);
    summarySheet.mergeCells("A2:G2");
    summarySheet.getCell("A2").alignment = { horizontal: "center" };
    summarySheet.getCell("A2").font = { bold: true, size: 12 };

    summarySheet.addRow([]); // Row 3 blank

    summarySheet.addRow([`Report Generated Date & Time: ${data.metadata.generatedAt}`]);
    summarySheet.mergeCells("A4:G4");
    summarySheet.getCell("A4").alignment = { horizontal: "center" };

    summarySheet.addRow([]); // Row 5 blank

    summarySheet.addRow([
        `Statement Period       From Date   ${data.metadata.fromDate}       To Date   ${data.metadata.toDate}`,
    ]);
    summarySheet.mergeCells("A6:G6");
    const periodCell = summarySheet.getCell("A6");
    periodCell.alignment = { horizontal: "center" };
    periodCell.font = { bold: true };
    periodCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9D9D9" },
    };

    summarySheet.addRow([]); // Row 7 blank

    const nameLabel = data.metadata.isMerchant ? "Merchant" : "User";
    const nameValue = data.metadata.isMerchant ? data.metadata.merchantName : data.metadata.userName;

    const walletSummaryHeaders = [
        "Account Number",
        "Currency",
        nameLabel,
        "Opening Balance",
        "Total Deposits",
        "Total Transfers",
        "Closing or Running Balance",
    ];
    const wsHeaderRow = summarySheet.addRow(walletSummaryHeaders);
    wsHeaderRow.font = { bold: true };
    wsHeaderRow.eachCell((cell: ExcelJS.Cell) => {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
        };
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
        };
        cell.alignment = { horizontal: "center" };
    });

    const wsDataRow = summarySheet.addRow([
        data.walletSummary.account_number,
        data.walletSummary.currency,
        nameValue,
        data.walletSummary.opening_balance,
        data.walletSummary.amount_received,
        data.walletSummary.amount_paid,
        data.walletSummary.closing_balance,
    ]);
    wsDataRow.eachCell((cell: ExcelJS.Cell) => {
        cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
        };
    });

    // --- Sheet 2: Transactions ---
    const txnSheet = workbook.addWorksheet("Transactions");
    txnSheet.columns = [
        { width: 25 }, { width: 25 }, { width: 25 }, { width: 25 }, { width: 20 },
        { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 },
        { width: 20 }, { width: 20 }, { width: 20 }, { width: 25 }
    ];

    // Wallet Summary Key-Value vertical
    const addKVPair = (key: string, value: any) => {
        const row = txnSheet.addRow([key, value]);
        row.getCell(1).font = { bold: true };
        row.getCell(2).alignment = { horizontal: "left" };
    };
    addKVPair("Wallet ID", data.walletSummary.account_number);
    addKVPair("Currency", data.walletSummary.currency);
    addKVPair(data.metadata.isMerchant ? "Merchant Name" : "User Name", nameValue);
    addKVPair("Opening Balance", data.walletSummary.opening_balance);
    addKVPair("Amount Received", data.walletSummary.amount_received);
    addKVPair("Amount Paid", data.walletSummary.amount_paid);
    addKVPair("Closing Balance", data.walletSummary.closing_balance);

    txnSheet.addRow([]); // Blank row

    // Helper for applying styles to data rows
    const applyBorders = (row: ExcelJS.Row) => {
        row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
            };
        });
    };

    // --- Payins Table ---
    const payinTitleRow = txnSheet.addRow(["Payin (Deposit Transactions)"]);
    txnSheet.mergeCells(`A${payinTitleRow.number}:J${payinTitleRow.number}`);
    payinTitleRow.getCell(1).alignment = { horizontal: "center" };
    payinTitleRow.getCell(1).font = { bold: true, size: 11 };
    payinTitleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    payinTitleRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

    const payinHeaders = [
        "Date & Time", "Transaction ID", "Type", "From Wallet & Currency",
        "Txn Status", "Transfer Amount", "Transfer Currency", "Fee", "Remarks", "Refund Transaction ID"
    ];
    const payinHeaderRow = txnSheet.addRow(payinHeaders);
    payinHeaderRow.font = { bold: true };
    payinHeaderRow.eachCell((cell: ExcelJS.Cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        cell.alignment = { horizontal: "center" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    const statementTimezone = data.metadata.timezone || "Asia/Kolkata";

    if (data.payins && data.payins.length > 0) {
        data.payins.forEach(({ transaction, ledger }: any) => {
            const row = txnSheet.addRow([
                formatStatementTimestamp(transaction.createdAt, statementTimezone),
                transaction.uniqueId,
                transaction.type || "", // From HTML $payin->type ?? ''
                transaction.depositCurrency || data.walletSummary.currency || "", // Closest match to From Wallet & Currency
                statementDepositStatusLabel(transaction.status),
                Number(transaction.amount || transaction.totalAmount || 0),
                transaction.depositCurrency || data.walletSummary.currency || "",
                Number(transaction.totalCommissionAmount || transaction.feeAmount || 0),
                transaction.memo || transaction.remarks || "",
                ledger.refundLedgerId ? String(ledger.refundLedgerId) : "-"
            ]);
            applyBorders(row);
            row.getCell(3).alignment = { horizontal: "center" };
            row.getCell(4).alignment = { horizontal: "center" };
            row.getCell(5).alignment = { horizontal: "center" };
            row.getCell(7).alignment = { horizontal: "center" };
            row.getCell(9).alignment = { horizontal: "right" };
            row.getCell(10).alignment = { horizontal: "center" };
        });
    } else {
        const emptyRow = txnSheet.addRow(["No Payin transactions found for the selected period."]);
        txnSheet.mergeCells(`A${emptyRow.number}:J${emptyRow.number}`);
        emptyRow.getCell(1).alignment = { horizontal: "center" };
        emptyRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }

    txnSheet.addRow([]); // Blank row

    // --- Payouts Table ---
    const payoutTitleRow = txnSheet.addRow(["Payout (Beneficiary Transactions)"]);
    txnSheet.mergeCells(`A${payoutTitleRow.number}:N${payoutTitleRow.number}`);
    payoutTitleRow.getCell(1).alignment = { horizontal: "center" };
    payoutTitleRow.getCell(1).font = { bold: true, size: 11 };
    payoutTitleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    payoutTitleRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

    const payoutHeaders = [
        "Date & Time", "Transaction ID", "Client Reference ID", "Type",
        "Txn Status", "UTR", "Amount", "Currency", "Fee", "Total Amount",
        "Recipient Amount", "Recipient Currency", "Remarks", "Refund Status"
    ];
    const payoutHeaderRow = txnSheet.addRow(payoutHeaders);
    payoutHeaderRow.font = { bold: true };
    payoutHeaderRow.eachCell((cell: ExcelJS.Cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        cell.alignment = { horizontal: "center" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    if (data.payouts && data.payouts.length > 0) {
        data.payouts.forEach(({ transaction, ledger, refunded }: any) => {
            const row = txnSheet.addRow([
                formatStatementTimestamp(transaction.createdAt, statementTimezone),
                transaction.uniqueId,
                transaction.clientReferenceId || "",
                "Beneficiary Payout",
                statementPayoutStatusLabel(transaction.status),
                transaction.externalReferenceId || transaction.txnRefNo || "",
                Number(transaction.amount || 0),
                data.walletSummary.currency, // As per template, it uses source currency
                Number(transaction.commissionAmount || 0),
                Number(transaction.totalAmount || 0),
                Number(transaction.recipientAmount || 0),
                transaction.receivingCurrency || "",
                transaction.remarks || "",
                refunded || ledger.refundLedgerId ? "Refunded" : "-"
            ]);
            applyBorders(row);
            row.getCell(4).alignment = { horizontal: "center" };
            row.getCell(5).alignment = { horizontal: "center" };
            row.getCell(6).alignment = { horizontal: "center" };
            row.getCell(8).alignment = { horizontal: "center" };
            row.getCell(12).alignment = { horizontal: "center" };
            row.getCell(14).alignment = { horizontal: "center" };
        });
    } else {
        const emptyRow = txnSheet.addRow(["No Payout transactions found for the selected period."]);
        txnSheet.mergeCells(`A${emptyRow.number}:N${emptyRow.number}`);
        emptyRow.getCell(1).alignment = { horizontal: "center" };
        emptyRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }

    txnSheet.addRow([]); // Blank row

    // --- Wallet Transactions Table ---
    const walletTitleRow = txnSheet.addRow(["Wallet Transactions"]);
    txnSheet.mergeCells(`A${walletTitleRow.number}:J${walletTitleRow.number}`);
    walletTitleRow.getCell(1).alignment = { horizontal: "center" };
    walletTitleRow.getCell(1).font = { bold: true, size: 11 };
    walletTitleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    walletTitleRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };

    const walletHeaders = [
        "Date & Time", "Transaction ID", "Wallet ID", "Type",
        "Status", "Amount", "Fee", "Total Amount", "Currency", "Remarks"
    ];
    const walletHeaderRow = txnSheet.addRow(walletHeaders);
    walletHeaderRow.font = { bold: true };
    walletHeaderRow.eachCell((cell: ExcelJS.Cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        cell.alignment = { horizontal: "center" };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    if (data.wallet_transactions && data.wallet_transactions.length > 0) {
        data.wallet_transactions.forEach(({ transaction, ledger }: any) => {
            const row = txnSheet.addRow([
                formatStatementTimestamp(transaction.createdAt, statementTimezone),
                transaction.uniqueId,
                transaction.walletId ? String(transaction.walletId) : "",
                transaction.type === 1 ? "credit" : "debit",
                statementWalletStatusLabel(transaction.status),
                Number(transaction.amount || 0),
                Number(transaction.fees || 0),
                Number(transaction.totalAmount || 0),
                data.walletSummary.currency, // Or transaction.currency if it existed
                ledger.description || ""
            ]);
            applyBorders(row);
            row.getCell(4).alignment = { horizontal: "center" };
            row.getCell(5).alignment = { horizontal: "center" };
        });
    } else {
        const emptyRow = txnSheet.addRow(["No Wallet transactions found for the selected period."]);
        txnSheet.mergeCells(`A${emptyRow.number}:J${emptyRow.number}`);
        emptyRow.getCell(1).alignment = { horizontal: "center" };
        emptyRow.getCell(1).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }

    // Apply general cell styles
    txnSheet.eachRow((row: ExcelJS.Row) => {
        row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
            cell.font = Object.assign({ name: "Arial", size: 10 }, cell.font || {});
        });
    });
    summarySheet.eachRow((row: ExcelJS.Row) => {
        row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
            cell.font = Object.assign({ name: "Arial", size: 10 }, cell.font || {});
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}
