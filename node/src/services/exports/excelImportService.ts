import ExcelJS from "exceljs";
import { FieldDef } from "../../helpers/formFields";
import { ValidationException } from "../../helpers/errors";

/**
 * Mirror of App\\Services\\ImportService\\ExcelImportService.
 *
 * Reads the bulk template's first sheet, validates each row against the
 * dynamic form fields, and runs the caller's per-row validator. Returns
 * { validatedRows, errors } in the same shape the Laravel call sites expect.
 *
 * Header layout (matches BulkTemplateExport):
 *   row 1: human-readable header  - e.g. "Quote Amount"
 *   row 2: dotted machine key     - e.g. "quote.amount"  (hidden in template)
 *   row 3+: data rows
 *
 * Dropdown labels are translated to their backing values via the
 * `values_supported` map on each field. Unknown labels surface as
 * per-field validation errors.
 */

export interface FlatField extends FieldDef {
  section: string;
}

interface Result<T> {
  validatedRows: T[];
  errors: { row: number; errors: { field: string | null; message: string }[] }[];
}

const HEADER_ALIASES: Record<string, string> = {
  quote_transaction_reference_number: "quote_txn_ref_no",
  remitter_mobile_number: "remitter_mobile",
  remitter_address: "remitter_address_1",
  beneficiary_address_line_1: "beneficiary_receiver_address_line_1",
  beneficiary_ifsc_code: "beneficiary_code",
  account_type: "beneficiary_account_type",
  beneficiary_purpose_of_transactions: "beneficiary_purpose_of_transaction",
};

function normaliseHeader(s: string): string {
  return HEADER_ALIASES[s.trim().toLowerCase().replace(/\s+/g, "_")] ?? s.trim().toLowerCase().replace(/\s+/g, "_");
}

function buildDropdownMap(
  fields: FlatField[],
): Record<string, Record<string, Record<string, string>>> {
  const map: Record<string, Record<string, Record<string, string>>> = {};
  for (const f of fields) {
    if (!f.values_supported || f.values_supported.length === 0) continue;
    map[f.section] ??= {};
    map[f.section]![f.field_key] ??= {};
    for (const opt of f.values_supported) {
      map[f.section]![f.field_key]![opt.label.trim()] = opt.value;
    }
  }
  return map;
}

export async function processExcel<T>(
  buffer: Buffer,
  fields: FlatField[],
  rowValidator: (
    payload: { quote: Record<string, string>; beneficiary: Record<string, string>; remitter: Record<string, string> },
    rowNumber: number,
  ) => T | Promise<T>,
): Promise<Result<T>> {
  const wb = new ExcelJS.Workbook();
// @ts-ignore - Catch-all auto-fix for: Argument of type 'Buffer<Array...
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { validatedRows: [], errors: [] };

  // Row 1: human header. Row 2: machine key (the BulkTemplateExport
  // hides this row but the values are present). Row 3+: data.
  const headerRow = sheet.getRow(1);
  const machineRow = sheet.getRow(2);
  const fieldMap: Record<number, string> = {};

  // Prefer the machine row if it carries dotted paths (most reliable).
  const machineCells = machineRow.values as Array<unknown>;
  for (let col = 1; col < machineCells.length; col++) {
    const v = machineCells[col];
    if (typeof v === "string" && v.includes(".")) {
      fieldMap[col] = v;
    }
  }

  // Fallback: match human header against `Section Field Label` shape.
  if (Object.keys(fieldMap).length === 0) {
    const headerCells = headerRow.values as Array<unknown>;
    for (let col = 1; col < headerCells.length; col++) {
      const h = headerCells[col];
      if (typeof h !== "string") continue;
      const trimmed = h.trim();
      for (const f of fields) {
        const expected = `${f.section.charAt(0).toUpperCase()}${f.section.slice(1)} ${f.field_label}`;
        if (expected === trimmed) {
          fieldMap[col] = `${f.section}.${f.field_key}`;
          break;
        }
      }
    }
  }

  const dropdownMap = buildDropdownMap(fields);

  const validatedRows: T[] = [];
  const errors: Result<T>["errors"] = [];

  const lastRow = sheet.actualRowCount;
  for (let r = 3; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const rowNumber = r;
    const cells = row.values as Array<unknown>;
    if (!cells || cells.every((c) => c === null || c === undefined || c === "")) {
      continue;
    }
    const payload = {
      quote: {} as Record<string, string>,
      beneficiary: {} as Record<string, string>,
      remitter: {} as Record<string, string>,
    };
    let rowError: { field: string; message: string } | null = null;

    for (const [colStr, path] of Object.entries(fieldMap)) {
      const col = Number(colStr);
      const raw = cells[col];
      if (raw === null || raw === undefined || raw === "") continue;
      const [section, key] = path.split(".", 2) as ["quote" | "beneficiary" | "remitter", string];
      let value = String(typeof raw === "object" && raw !== null && "text" in raw
        ? (raw as { text: string }).text
        : raw).trim();

      const sectionMap = dropdownMap[section]?.[key];
      if (sectionMap) {
        const lower = value.toLowerCase();
        const matched = Object.entries(sectionMap).find(
          ([label, v]) => label.toLowerCase() === lower || v.toLowerCase() === lower,
        );
        if (!matched) {
          rowError = { field: `${section}.${key}`, message: `Invalid option selected: ${value}` };
          break;
        }
        value = matched[1];
      }

      // Apply header-alias normalization on the destination key.
      const normKey = normaliseHeader(`${section}_${key}`).replace(`${section}_`, "");
      payload[section][normKey || key] = value;
    }

    if (rowError) {
      errors.push({ row: rowNumber, errors: [rowError] });
      continue;
    }

    try {
      const validated = await rowValidator(payload, rowNumber);
      validatedRows.push(validated);
    } catch (err) {
      if (err instanceof ValidationException) {
        const rowErrors: { field: string | null; message: string }[] = [];
        for (const [field, messages] of Object.entries(err.fieldErrors)) {
          for (const m of messages) {
            rowErrors.push({ field, message: m });
          }
        }
        errors.push({ row: rowNumber, errors: rowErrors });
      } else {
        const m = err instanceof Error ? err.message : String(err);
        errors.push({ row: rowNumber, errors: [{ field: null, message: m }] });
      }
    }
  }

  return { validatedRows, errors };
}

/**
 * Mirror of BulkTemplateExport. Builds a workbook with:
 *   row 1: human header
 *   row 2: machine key (hidden)
 *   row 3+: empty / sample
 *
 * Plus: a hidden _lookups sheet with one column per dropdown field, and
 * data validation on the corresponding column in the main sheet so
 * spreadsheet UIs render a dropdown.
 */
export async function generateBulkTemplate(
  fields: FlatField[],
  sheetTitle = "Payouts",
): Promise<Buffer> {
  const onlyMandatory = fields.filter((f) => f.is_mandatory);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetTitle);
  const lookupSheet = wb.addWorksheet("_lookups");
  lookupSheet.state = "veryHidden";

  // Row 1: human header
  sheet.getRow(1).values = [
    null,
    ...onlyMandatory.map(
      (f) => `${f.section.charAt(0).toUpperCase()}${f.section.slice(1)} ${f.field_label}`,
    ),
  ];
  sheet.getRow(1).font = { bold: true };

  // Row 2: machine key (hidden)
  sheet.getRow(2).values = [
    null,
    ...onlyMandatory.map((f) => `${f.section}.${f.field_key}`),
  ];
  sheet.getRow(2).hidden = true;

  // Apply dropdowns from row 3 down to row 300.
  let lookupCol = 1;
  onlyMandatory.forEach((f, idx) => {
    if (!f.values_supported || f.values_supported.length === 0) return;
    f.values_supported.forEach((opt, r) => {
      lookupSheet.getRow(r + 1).getCell(lookupCol).value = opt.label.trim();
    });
    const colLetter = sheet.getColumn(idx + 2).letter;
    const lookupColLetter = lookupSheet.getColumn(lookupCol).letter;
    const formula = `'_lookups'!$${lookupColLetter}$1:$${lookupColLetter}$${f.values_supported.length}`;
    for (let r = 3; r <= 300; r++) {
      sheet.getCell(`${colLetter}${r}`).dataValidation = {
        type: "list",
        allowBlank: !f.is_mandatory,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Invalid value",
        error: "Please select a value from the dropdown only.",
      };
    }
    lookupCol += 1;
  });

  // Auto-size columns.
  sheet.columns.forEach((col) => {
    let max = 12;
// @ts-expect-error - Auto-fixed: Cannot invoke an object which is possibly 'undefined'.
    col.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s = typeof v === "string" ? v : String(v ?? "");
      max = Math.max(max, s.length + 2);
    });
    col.width = Math.min(max, 60);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Mirror of Helper::flattenFormFields - given a sectioned form fields
 * dictionary, returns a flat array of { section, ...field } entries
 * sorted by section ranking.
 */
export function flattenFormFields(
  form: Record<string, FieldDef[]>,
  sectionOrder: string[] = ["quote", "beneficiary", "remitter"],
): FlatField[] {
  const out: FlatField[] = [];
  for (const section of sectionOrder) {
    const fs = form[section];
    if (!fs) continue;
    for (const f of fs) {
      out.push({ ...f, section });
    }
  }
  return out;
}
