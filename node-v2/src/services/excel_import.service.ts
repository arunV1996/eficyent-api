import ExcelJS from "exceljs";
import { CodedError } from "../helpers/coded_error.helper";
import { FieldDef } from "../helpers/form_fields.helper";

/**
 * Bulk-import Excel machinery (mirror of the legacy
 * services/exports/excelImportService.ts / App\Services\ImportService
 * \ExcelImportService + BulkTemplateExport).
 *
 * Template layout:
 *   row 1: human-readable header  — e.g. "Quote Amount"
 *   row 2: dotted machine key     — e.g. "quote.amount"  (hidden)
 *   row 3+: data rows
 *
 * Dropdown labels are translated to their backing values via each
 * field's values_supported map; unknown labels surface as per-row
 * validation errors.
 *
 * NOTE on error collection: the legacy row validator raised a
 * ValidationException carrying a fieldErrors map. The node-v2
 * normalizers raise FormFieldsError / CodedError (a single message +
 * code) instead, so a failing row collects one { field: null, message }
 * entry — the same shape the legacy fallback branch produced for
 * non-ValidationException throws.
 */

export interface FlatField extends FieldDef {
    section: string;
}

interface ImportResult<T> {
    validatedRows: T[];
    errors: {
        row: number;
        errors: { field: string | null; message: string }[];
    }[];
}

const HEADER_ALIASES: Record<string, string> = {
    quote_transaction_reference_number: "quote_txn_ref_no",
    remitter_mobile_number: "remitter_mobile",
    remitter_address: "remitter_address_1",
    beneficiary_address_line_1: "beneficiary_receiver_address_line_1",
    beneficiary_ifsc_code: "beneficiary_code",
    account_type: "beneficiary_account_type",
    beneficiary_purpose_of_transactions: "beneficiary_purpose_of_transaction",

    // Legacy/associative sheet headers (mirror of the Laravel
    // ExcelImportService::headerAliases refactor).
    receiptno: "quote_txn_ref_no",
    famount: "quote_amount",
    senderfullname: "remitter_first_name",
    sendercountry: "remitter_nationality",
    senderaddress: "remitter_address_1",
    sendercity: "remitter_city",
    senderpostalcode: "remitter_postal_code",
    senderstate: "remitter_state",
    senderidentitytype: "remitter_id_type",
    senderidentitynumber: "remitter_id_number",
    senderphoneno: "remitter_mobile",
    senderemail: "remitter_email",
    senderbirthdate: "remitter_dob",
    senderfundresource: "remitter_source_of_funds",
    accountno: "beneficiary_account_number",
    beneficiaryname: "beneficiary_first_name",
    beneaddress: "beneficiary_receiver_address_line_1",
    beneprovince: "beneficiary_address_city",
    benecity: "beneficiary_city",
    benecountry: "beneficiary_address_country",
    purpose: "beneficiary_purpose_of_transaction",
    ifsc: "beneficiary_code",
    code: "beneficiary_code",
    beneficiary_brstn: "beneficiary_code",
    beneficiary_swift_code: "beneficiary_code",
    beneficiary_bank_code: "beneficiary_code",
    service_bank: "beneficiary_service_bank",
    bankname: "beneficiary_service_bank",
};

/** trim + lowercase + spaces->underscores, WITHOUT alias translation. */
const normaliseHeaderRaw = (value: string): string => {
    return value.trim().toLowerCase().replace(/\s+/g, "_");
};

const normaliseHeader = (value: string): string => {
    const normalized = normaliseHeaderRaw(value);
    return HEADER_ALIASES[normalized] ?? normalized;
};

/**
 * Mirror of Helper::splitFullName — first token becomes first_name,
 * the remainder last_name; a single-token name reuses it as last_name.
 */
export const splitFullName = (
    fullName: string,
): { first_name: string; last_name: string; full_name: string } => {
    const trimmedName = String(fullName).trim().replace(/\s+/g, " ");
    const nameParts = trimmedName.split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName =
        nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;
    return {
        first_name: firstName,
        last_name: lastName,
        full_name: trimmedName,
    };
};

const buildDropdownMap = (
    fields: FlatField[],
): Record<string, Record<string, Record<string, string>>> => {
    const map: Record<string, Record<string, Record<string, string>>> = {};
    for (const field of fields) {
        if (!field.values_supported || field.values_supported.length === 0) {
            continue;
        }
        map[field.section] ??= {};
        map[field.section][field.field_key] ??= {};
        for (const option of field.values_supported) {
            map[field.section][field.field_key][option.label.trim()] =
                option.value;
        }
    }
    return map;
};

type ImportSection = "quote" | "beneficiary" | "remitter";

/** Excel cell -> trimmed string (dates flatten to YYYY-MM-DD). */
const cellValueToString = (raw: unknown): string => {
    if (raw instanceof Date) {
        const year = raw.getFullYear();
        const month = String(raw.getMonth() + 1).padStart(2, "0");
        const day = String(raw.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    return String(
        typeof raw === "object" && raw !== null && "text" in raw
            ? (raw as { text: string }).text
            : raw,
    ).trim();
};

export interface ImportRowPayload {
    quote: Record<string, string>;
    beneficiary: Record<string, string>;
    remitter: Record<string, string>;
}

/**
 * Reads the template's first sheet, maps each column to its dotted
 * section.key path, translates dropdown labels to values, and runs the
 * caller's per-row validator. Returns { validatedRows, errors }.
 */
export const processExcel = async <T>(
    buffer: Buffer,
    fields: FlatField[],
    rowValidator: (
        payload: ImportRowPayload,
        rowNumber: number,
    ) => T | Promise<T>,
): Promise<ImportResult<T>> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
        return { validatedRows: [], errors: [] };
    }

    const headerRow = sheet.getRow(1);
    const machineRow = sheet.getRow(2);
    const fieldMap: Record<number, string> = {};
    // Columns carrying a combined full name (legacy "SenderFullName" /
    // "BeneficiaryName" sheets) — handled by splitFullName instead of
    // the plain field mapping.
    const fullNameColumns: Record<number, "sender" | "beneficiary"> = {};

    // Prefer the hidden machine row when it carries dotted section paths
    // (most reliable); otherwise fall back to matching the human header.
    const machineCells = machineRow.values as Array<unknown>;
    let hasMachineKeys = false;
    const tempFieldMap: Record<number, string> = {};
    for (let col = 1; col < machineCells.length; col += 1) {
        const value = machineCells[col];
        if (
            typeof value === "string" &&
            /^(quote|beneficiary|remitter)\.[a-z_0-9]+$/i.test(value.trim())
        ) {
            tempFieldMap[col] = value.trim();
            hasMachineKeys = true;
        }
    }

    let startRow = 3;
    if (hasMachineKeys) {
        Object.assign(fieldMap, tempFieldMap);
    } else {
        startRow = 2;
        const headerCells = headerRow.values as Array<unknown>;
        for (let col = 1; col < headerCells.length; col += 1) {
            const headerValue = headerCells[col];
            if (typeof headerValue !== "string") {
                continue;
            }
            // Combined-name headers split into first/last (and account
            // name) — matched on the raw header, before aliasing.
            const rawHeader = normaliseHeaderRaw(headerValue);
            if (rawHeader === "senderfullname") {
                fullNameColumns[col] = "sender";
                continue;
            }
            if (rawHeader === "beneficiaryname") {
                fullNameColumns[col] = "beneficiary";
                continue;
            }
            const normalizedHeader = normaliseHeader(headerValue);
            for (const field of fields) {
                const expectedDotted = `${field.section}.${field.field_key}`;
                const expectedUnderscored = `${field.section}_${field.field_key}`;
                const expectedHuman = `${field.section.charAt(0).toUpperCase()}${field.section.slice(1)} ${field.field_label}`;

                if (
                    normalizedHeader === expectedUnderscored ||
                    normalizedHeader === normaliseHeader(expectedUnderscored) ||
                    normalizedHeader === normaliseHeader(expectedHuman) ||
                    headerValue.trim() === expectedHuman
                ) {
                    fieldMap[col] = expectedDotted;
                    break;
                }
            }
        }
    }

    const dropdownMap = buildDropdownMap(fields);

    const validatedRows: T[] = [];
    const errors: ImportResult<T>["errors"] = [];

    const lastRow = sheet.actualRowCount;
    for (let rowIndex = startRow; rowIndex <= lastRow; rowIndex += 1) {
        const row = sheet.getRow(rowIndex);
        const cells = row.values as Array<unknown>;
        if (
            !cells ||
            cells.every(
                (cell) => cell === null || cell === undefined || cell === "",
            )
        ) {
            continue;
        }

        const payload: ImportRowPayload = {
            quote: {},
            beneficiary: {},
            remitter: {},
        };
        let rowError: { field: string; message: string } | null = null;

        for (const [colString, path] of Object.entries(fieldMap)) {
            const col = Number(colString);
            const raw = cells[col];
            if (raw === null || raw === undefined || raw === "") {
                continue;
            }
            const [section, key] = path.split(".", 2) as [
                ImportSection,
                string,
            ];
            let value = cellValueToString(raw);

            const sectionMap = dropdownMap[section]?.[key];
            if (sectionMap) {
                const lower = value.toLowerCase();
                const matched = Object.entries(sectionMap).find(
                    ([label, backingValue]) =>
                        label.toLowerCase() === lower ||
                        backingValue.toLowerCase() === lower,
                );
                if (!matched) {
                    rowError = {
                        field: `${section}.${key}`,
                        message: `Invalid option selected: ${value}`,
                    };
                    break;
                }
                value = matched[1];
            }

            // Apply the header-alias normalization on the destination key.
            const normalizedKey = normaliseHeader(
                `${section}_${key}`,
            ).replace(`${section}_`, "");
            payload[section][normalizedKey || key] = value;
        }

        if (rowError) {
            errors.push({ row: rowIndex, errors: [rowError] });
            continue;
        }

        // Combined full-name columns: split into first/last (mirror of
        // Helper::splitFullName). Explicitly-mapped individual name
        // columns always win over the split.
        for (const [colString, target] of Object.entries(fullNameColumns)) {
            const raw = cells[Number(colString)];
            if (raw === null || raw === undefined || raw === "") {
                continue;
            }
            const nameParts = splitFullName(cellValueToString(raw));
            if (nameParts.full_name === "") {
                continue;
            }
            if (target === "sender") {
                if (!payload.remitter.first_name) {
                    payload.remitter.first_name = nameParts.first_name;
                }
                if (!payload.remitter.last_name) {
                    payload.remitter.last_name = nameParts.last_name;
                }
            } else if (
                !payload.beneficiary.first_name &&
                !payload.beneficiary.last_name
            ) {
                if (!payload.beneficiary.account_name) {
                    payload.beneficiary.account_name = nameParts.full_name;
                }
                payload.beneficiary.first_name = nameParts.first_name;
                payload.beneficiary.last_name = nameParts.last_name;
            }
        }

        try {
            const validated = await rowValidator(payload, rowIndex);
            validatedRows.push(validated);
        } catch (validationError) {
            const message =
                validationError instanceof CodedError
                    ? validationError.message
                    : validationError instanceof Error
                      ? validationError.message
                      : String(validationError);
            errors.push({
                row: rowIndex,
                errors: [{ field: null, message }],
            });
        }
    }

    return { validatedRows, errors };
};

/**
 * Mirror of BulkTemplateExport. Builds a workbook with the human header
 * (row 1), the hidden machine key (row 2) and empty data rows, plus a
 * veryHidden _lookups sheet backing a dropdown data-validation on each
 * option-bearing column. All fields are emitted — optional and
 * conditional columns (SWIFT code, routing number, intermediary bank
 * details, ...) included, so rows can carry everything the single
 * beneficiary form accepts.
 */
export const generateBulkTemplate = async (
    fields: FlatField[],
    sheetTitle = "Payouts",
): Promise<Buffer> => {
    const templateFields = fields;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetTitle);
    const lookupSheet = workbook.addWorksheet("_lookups");
    lookupSheet.state = "veryHidden";

    sheet.getRow(1).values = [
        null,
        ...templateFields.map(
            (field) =>
                `${field.section.charAt(0).toUpperCase()}${field.section.slice(1)} ${field.field_label}`,
        ),
    ];
    sheet.getRow(1).font = { bold: true };

    sheet.getRow(2).values = [
        null,
        ...templateFields.map(
            (field) => `${field.section}.${field.field_key}`,
        ),
    ];
    sheet.getRow(2).hidden = true;

    // Dropdown data-validation from row 3 down to row 300.
    let lookupCol = 1;
    templateFields.forEach((field, index) => {
        if (!field.values_supported || field.values_supported.length === 0) {
            return;
        }
        field.values_supported.forEach((option, optionIndex) => {
            lookupSheet.getRow(optionIndex + 1).getCell(lookupCol).value =
                option.label.trim();
        });
        const colLetter = sheet.getColumn(index + 2).letter;
        const lookupColLetter = lookupSheet.getColumn(lookupCol).letter;
        const formula = `'_lookups'!$${lookupColLetter}$1:$${lookupColLetter}$${field.values_supported.length}`;
        for (let rowIndex = 3; rowIndex <= 300; rowIndex += 1) {
            sheet.getCell(`${colLetter}${rowIndex}`).dataValidation = {
                type: "list",
                allowBlank: !field.is_mandatory,
                formulae: [formula],
                showErrorMessage: true,
                errorStyle: "stop",
                errorTitle: "Invalid value",
                error: "Please select a value from the dropdown only.",
            };
        }
        lookupCol += 1;
    });

    sheet.columns.forEach((col) => {
        let maxWidth = 12;
        col.eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
            const cellValue = cell.value;
            const asString =
                typeof cellValue === "string"
                    ? cellValue
                    : String(cellValue ?? "");
            maxWidth = Math.max(maxWidth, asString.length + 2);
        });
        col.width = Math.min(maxWidth, 60);
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
};

/**
 * Mirror of Helper::flattenFormFields — flattens a sectioned form-field
 * dictionary into a section-tagged array, ordered by the given sections.
 */
export const flattenFormFields = (
    form: Record<string, FieldDef[]>,
    sectionOrder: string[] = ["quote", "beneficiary", "remitter"],
): FlatField[] => {
    const out: FlatField[] = [];
    for (const section of sectionOrder) {
        const sectionFields = form[section];
        if (!sectionFields) {
            continue;
        }
        for (const field of sectionFields) {
            out.push({ ...field, section });
        }
    }
    return out;
};
