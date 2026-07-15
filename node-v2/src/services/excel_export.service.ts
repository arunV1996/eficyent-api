import ExcelJS from "exceljs";

/**
 * Generic table-to-xlsx exporter for the deposits / ledgers / payout
 * list exports (mirror of the legacy services/exports/excelExport.ts,
 * itself mirroring the Laravel *Export classes). Column headers come
 * from the first row's keys unless overridden.
 */
export const generateExcel = async (
    rows: Array<Record<string, unknown>>,
    options: { sheetTitle?: string; columns?: string[] } = {},
): Promise<Buffer> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(options.sheetTitle ?? "Sheet1");

    const columns = options.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    if (columns.length === 0) {
        return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    sheet.columns = columns.map((column) => ({
        header: column,
        key: column,
        width: Math.max(column.length + 2, 18),
    }));
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
        sheet.addRow(row);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
};
