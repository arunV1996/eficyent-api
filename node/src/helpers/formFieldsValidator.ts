import { ZodError, ZodIssue, z } from "zod";
import { FieldDef } from "./formFields";
import { ValidationException } from "./errors";

/**
 * Mirror of Helper::buildFormRules - turns a FieldDef list into a runtime
 * validator. We don't pre-build a static Zod schema (the field set changes
 * per request) so this is a streaming validator: walk the fields, validate
 * each value against the field's rules, collect errors.
 *
 * Errors collected here are surfaced via the same 422 envelope as the static
 * Zod schemas elsewhere in the codebase.
 */

interface FieldValidationResult {
  validated: Record<string, unknown>;
  errors: Record<string, string[]>;
}

function unwrapRegex(re: string): RegExp {
  // Laravel stores regexes as `/<pattern>/` strings or as bare patterns. We
  // accept both. JS regex doesn't support PHP modifiers like `u`, so strip
  // anything outside of `i`, `m`, `s` from the trailing flags.
  if (re.startsWith("/")) {
    const lastSlash = re.lastIndexOf("/");
    if (lastSlash > 0) {
      const body = re.slice(1, lastSlash);
      const flags = re
        .slice(lastSlash + 1)
        .split("")
        .filter((f) => "gimsuy".includes(f))
        .join("");
      return new RegExp(body, flags);
    }
  }
  return new RegExp(re);
}

function pushErr(errors: Record<string, string[]>, key: string, msg: string): void {
  if (!errors[key]) errors[key] = [];
  errors[key].push(msg);
}

function validateScalar(
  field: FieldDef,
  fullKey: string,
  value: unknown,
  errors: Record<string, string[]>,
): unknown {
  const v = field.validation as Record<string, unknown>;
  const isPresent =
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && value.length === 0);

  if (!isPresent) {
    if (field.is_mandatory) pushErr(errors, fullKey, `${field.field_label} is required.`);
    return value;
  }

  if (field.field_type === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) {
      pushErr(errors, fullKey, `${field.field_label} must be numeric.`);
      return value;
    }
    if (typeof v.min_value === "number" && n < (v.min_value as number)) {
      pushErr(errors, fullKey, `${field.field_label} is below minimum.`);
    }
    if (typeof v.max_value === "number" && n > (v.max_value as number)) {
      pushErr(errors, fullKey, `${field.field_label} is above maximum.`);
    }
    return n;
  }

  if (field.field_type === "email") {
    const s = String(value).trim();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(s)) pushErr(errors, fullKey, `${field.field_label} must be a valid email.`);
    value = s;
  }

  if (field.field_type === "date") {
    const s = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
      pushErr(errors, fullKey, `${field.field_label} must be YYYY-MM-DD.`);
    }
    if (typeof v.max_date === "string" && Date.parse(s) > Date.parse(v.max_date)) {
      pushErr(errors, fullKey, `${field.field_label} must not be after ${v.max_date}.`);
    }
    if (typeof v.min_date === "string" && Date.parse(s) < Date.parse(v.min_date)) {
      pushErr(errors, fullKey, `${field.field_label} must not be before ${v.min_date}.`);
    }
  }

  if (field.field_type === "file") {
    // We accept either a base64 data URL or an HTTPS URL pointing at S3.
    if (typeof value !== "string") {
      pushErr(errors, fullKey, `${field.field_label} must be a string.`);
      return value;
    }
    if (value.startsWith("data:")) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(value);
      if (!m) {
        pushErr(errors, fullKey, "Invalid Base64 format.");
        return value;
      }
      const mime = m[1] ?? "";
      const data = m[2] ?? "";
      const accepted = (v.accepted_extensions as string[]) ?? [];
      if (accepted.length > 0 && !accepted.includes(mime)) {
        pushErr(errors, fullKey, `Invalid file type: ${mime}.`);
      }
      const max = v.max_file_size as number | undefined;
      if (max && Buffer.from(data, "base64").length > max) {
        pushErr(errors, fullKey, "File exceeds maximum allowed size.");
      }
    } else if (!/^https:\/\/.+/i.test(value)) {
      pushErr(errors, fullKey, "File must be a Base64 data URL or an HTTPS URL.");
    }
    return value;
  }

  // Default: string-like.
  const s = String(value);

  if (typeof v.min_length === "number" && s.length < (v.min_length as number)) {
    pushErr(errors, fullKey, `${field.field_label} must be at least ${v.min_length} chars.`);
  }
  if (typeof v.max_length === "number" && s.length > (v.max_length as number)) {
    pushErr(errors, fullKey, `${field.field_label} must be at most ${v.max_length} chars.`);
  }
  if (typeof v.regex === "string") {
    try {
      const re = unwrapRegex(v.regex as string);
      if (!re.test(s)) {
        pushErr(errors, fullKey, `${field.field_label} format is invalid.`);
      }
    } catch {
      // Invalid PHP regex - skip.
    }
  }

  if (field.values_supported && field.values_supported.length > 0) {
    const lower = field.values_supported.map((v2) => String(v2.value).toLowerCase());
    if (!lower.includes(s.toLowerCase())) {
      pushErr(errors, fullKey, `The selected ${field.field_label} is invalid.`);
    }
  }

  return s;
}

function validateField(
  field: FieldDef,
  prefix: string,
  source: Record<string, unknown> | null,
  errors: Record<string, string[]>,
): unknown {
  const fullKey = prefix ? `${prefix}.${field.field_key}` : field.field_key;
  const value = source ? source[field.field_key] : undefined;

  if (field.field_type === "group") {
    if (field.is_repeatable) {
      if (!Array.isArray(value)) {
        if (field.is_mandatory) pushErr(errors, fullKey, `${field.field_label} must be an array.`);
        return [];
      }
      return value.map((entry, idx) => {
        const entryKey = `${fullKey}.${idx}`;
        const entryObj: Record<string, unknown> = {};
        for (const child of field.children) {
          entryObj[child.field_key] = validateField(
            child,
            entryKey,
            entry as Record<string, unknown>,
            errors,
          );
        }
        return entryObj;
      });
    }
    const obj: Record<string, unknown> = {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const child of field.children) {
        obj[child.field_key] = validateField(
          child,
          fullKey,
          value as Record<string, unknown>,
          errors,
        );
      }
    } else if (field.is_mandatory) {
      pushErr(errors, fullKey, `${field.field_label} is required.`);
    }
    return obj;
  }

  return validateScalar(field, fullKey, value, errors);
}

/**
 * Validate a request body against a list of field definitions.
 * Throws ValidationException with collected errors. Returns the cleaned
 * payload on success.
 */
export function validateAgainstFields(
  fields: FieldDef[],
  payload: Record<string, unknown>,
): FieldValidationResult {
  const errors: Record<string, string[]> = {};
  const validated: Record<string, unknown> = {};
  for (const field of fields) {
    validated[field.field_key] = validateField(field, "", payload, errors);
  }
  return { validated, errors };
}

export function ensureNoFieldErrors(result: FieldValidationResult): Record<string, unknown> {
  if (Object.keys(result.errors).length > 0) {
    throw new ValidationException(result.errors);
  }
  return result.validated;
}

// Quiet re-exports so this module is self-contained for callers that also
// want to use Zod alongside (e.g. partial endpoints with mixed validation).
export { z, ZodError, type ZodIssue };
