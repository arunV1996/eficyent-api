import ExcelJS from "exceljs";

/**
 * Generic table-to-xlsx exporter used for deposits, ledgers, beneficiary
 * transactions exports. Mirrors the column headers from the Laravel
 * *Export classes (DepositExport, LedgerExport,
 * BeneficiaryTransactionsDataExport).
 */
export async function generateExcel(
  rows: Array<Record<string, unknown>>,
  options: { sheetTitle?: string; columns?: string[] } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(options.sheetTitle ?? "Sheet1");

  const columns =
    options.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  if (columns.length === 0) {
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  sheet.columns = columns.map((c) => ({
    header: c,
    key: c,
    width: Math.max(c.length + 2, 18),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    sheet.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
