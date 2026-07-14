import { FieldDef } from "./form_fields.helper";

/**
 * Runtime validator for the dynamic form-field definitions (mirror of
 * the legacy helpers/formFieldsValidator.ts). The field set changes
 * per request so we walk the fields, validate each value against its
 * rules, and collect errors keyed by field path.
 */

export interface FieldValidationResult {
    validated: Record<string, unknown>;
    errors: Record<string, string[]>;
}

/**
 * Laravel stores regexes as `/<pattern>/` strings or bare patterns; we
 * accept both. PHP-only modifiers are stripped from the trailing flags.
 */
const unwrapRegex = (rawRegex: string): RegExp => {
    if (rawRegex.startsWith("/")) {
        const lastSlashPosition = rawRegex.lastIndexOf("/");
        if (lastSlashPosition > 0) {
            const pattern = rawRegex.slice(1, lastSlashPosition);
            const flags = rawRegex
                .slice(lastSlashPosition + 1)
                .split("")
                .filter((flag) => "gimsuy".includes(flag))
                .join("");
            return new RegExp(pattern, flags);
        }
    }
    return new RegExp(rawRegex);
};

const pushError = (
    errors: Record<string, string[]>,
    key: string,
    message: string,
): void => {
    if (!errors[key]) {
        errors[key] = [];
    }
    errors[key].push(message);
};

const validateScalar = (
    field: FieldDef,
    fullKey: string,
    value: unknown,
    errors: Record<string, string[]>,
    isMandatory: boolean,
): unknown => {
    const rules = field.validation as Record<string, unknown>;
    const isPresent =
        value !== undefined &&
        value !== null &&
        !(typeof value === "string" && value.length === 0);

    if (!isPresent) {
        if (isMandatory) {
            pushError(errors, fullKey, `${field.field_label} is required.`);
        }
        return value;
    }

    if (field.field_type === "number") {
        const numericValue = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(numericValue)) {
            pushError(errors, fullKey, `${field.field_label} must be numeric.`);
            return value;
        }
        if (
            typeof rules.min_value === "number" &&
            numericValue < rules.min_value
        ) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} is below minimum.`,
            );
        }
        if (
            typeof rules.max_value === "number" &&
            numericValue > rules.max_value
        ) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} is above maximum.`,
            );
        }
        return numericValue;
    }

    if (field.field_type === "email") {
        const emailValue = String(value).trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} must be a valid email.`,
            );
        }
        value = emailValue;
    }

    if (field.field_type === "date") {
        const dateValue = String(value);
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) ||
            Number.isNaN(Date.parse(dateValue))
        ) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} must be YYYY-MM-DD.`,
            );
        }
        if (
            typeof rules.max_date === "string" &&
            Date.parse(dateValue) > Date.parse(rules.max_date)
        ) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} must not be after ${rules.max_date}.`,
            );
        }
        if (
            typeof rules.min_date === "string" &&
            Date.parse(dateValue) < Date.parse(rules.min_date)
        ) {
            pushError(
                errors,
                fullKey,
                `${field.field_label} must not be before ${rules.min_date}.`,
            );
        }
    }

    if (field.field_type === "file") {
        // Accept either a base64 data URL or an HTTPS URL pointing at S3.
        if (typeof value !== "string") {
            pushError(
                errors,
                fullKey,
                `${field.field_label} must be a string.`,
            );
            return value;
        }
        if (value.startsWith("data:")) {
            const dataUrlMatch = /^data:([^;]+);base64,(.+)$/.exec(value);
            if (!dataUrlMatch) {
                pushError(errors, fullKey, "Invalid Base64 format.");
                return value;
            }
            const mimeType = dataUrlMatch[1] ?? "";
            const base64Data = dataUrlMatch[2] ?? "";
            const acceptedExtensions =
                (rules.accepted_extensions as string[]) ?? [];
            if (
                acceptedExtensions.length > 0 &&
                !acceptedExtensions.includes(mimeType)
            ) {
                pushError(errors, fullKey, `Invalid file type: ${mimeType}.`);
            }
            const maxFileSize = rules.max_file_size as number | undefined;
            if (
                maxFileSize &&
                Buffer.from(base64Data, "base64").length > maxFileSize
            ) {
                pushError(
                    errors,
                    fullKey,
                    "File exceeds maximum allowed size.",
                );
            }
        } else if (!/^https:\/\/.+/i.test(value)) {
            pushError(
                errors,
                fullKey,
                "File must be a Base64 data URL or an HTTPS URL.",
            );
        }
        return value;
    }

    // Default: string-like.
    const stringValue = String(value).trim();

    if (
        typeof rules.min_length === "number" &&
        stringValue.length < rules.min_length
    ) {
        pushError(
            errors,
            fullKey,
            `${field.field_label} must be at least ${rules.min_length} chars.`,
        );
    }
    if (
        typeof rules.max_length === "number" &&
        stringValue.length > rules.max_length
    ) {
        pushError(
            errors,
            fullKey,
            `${field.field_label} must be at most ${rules.max_length} chars.`,
        );
    }
    if (typeof rules.regex === "string") {
        try {
            const compiledRegex = unwrapRegex(rules.regex);
            if (!compiledRegex.test(stringValue)) {
                pushError(
                    errors,
                    fullKey,
                    `${field.field_label} format is invalid.`,
                );
            }
        } catch {
            // Invalid PHP regex — skip.
        }
    }

    if (field.values_supported && field.values_supported.length > 0) {
        const supportedValues = field.values_supported.map((supported) =>
            String(supported.value).trim().toLowerCase(),
        );
        if (!supportedValues.includes(stringValue.toLowerCase())) {
            pushError(
                errors,
                fullKey,
                `The selected ${field.field_label} is invalid.`,
            );
        }
    }

    return stringValue;
};

const validateField = (
    field: FieldDef,
    prefix: string,
    source: Record<string, unknown> | null,
    errors: Record<string, string[]>,
): unknown => {
    const fullKey = prefix ? `${prefix}.${field.field_key}` : field.field_key;
    const value = source ? source[field.field_key] : undefined;

    let isMandatory = field.is_mandatory;
    if (!isMandatory && field.required_if_empty_of && source) {
        const otherValue = source[field.required_if_empty_of];
        const otherIsPresent =
            otherValue !== undefined &&
            otherValue !== null &&
            !(typeof otherValue === "string" && otherValue.length === 0);
        if (!otherIsPresent) {
            isMandatory = true;
        }
    }
    if (!isMandatory && field.required_if && source) {
        const otherValue = source[field.required_if];
        const otherIsPresent =
            otherValue !== undefined &&
            otherValue !== null &&
            !(typeof otherValue === "string" && otherValue.length === 0);
        if (otherIsPresent) {
            isMandatory = true;
        }
    }

    if (field.field_type === "group") {
        if (field.is_repeatable) {
            if (!Array.isArray(value)) {
                if (isMandatory) {
                    pushError(
                        errors,
                        fullKey,
                        `${field.field_label} must be an array.`,
                    );
                }
                return [];
            }
            return value.map((entry, entryIndex) => {
                const entryKey = `${fullKey}.${entryIndex}`;
                const entryObject: Record<string, unknown> = {};
                for (const childField of field.children) {
                    entryObject[childField.field_key] = validateField(
                        childField,
                        entryKey,
                        entry as Record<string, unknown>,
                        errors,
                    );
                }
                return entryObject;
            });
        }

        const groupObject: Record<string, unknown> = {};
        if (value && typeof value === "object" && !Array.isArray(value)) {
            for (const childField of field.children) {
                groupObject[childField.field_key] = validateField(
                    childField,
                    fullKey,
                    value as Record<string, unknown>,
                    errors,
                );
            }
        } else if (isMandatory) {
            pushError(errors, fullKey, `${field.field_label} is required.`);
        }
        return groupObject;
    }

    return validateScalar(field, fullKey, value, errors, isMandatory);
};

/**
 * Validates a request body against a list of field definitions and
 * returns the cleaned payload plus any collected errors.
 */
export const validateAgainstFields = (
    fields: FieldDef[],
    payload: Record<string, unknown>,
): FieldValidationResult => {
    const errors: Record<string, string[]> = {};
    const validated: Record<string, unknown> = {};
    for (const field of fields) {
        validated[field.field_key] = validateField(field, "", payload, errors);
    }
    return { validated, errors };
};

/**
 * Extracts the first error message from a validation result, in the
 * same format the legacy error middleware surfaced (used for the 422
 * envelope).
 */
export const firstFieldError = (
    result: FieldValidationResult,
): string | null => {
    const firstErrorKey = Object.keys(result.errors)[0];
    if (!firstErrorKey) {
        return null;
    }
    return result.errors[firstErrorKey][0] ?? "Validation error.";
};
