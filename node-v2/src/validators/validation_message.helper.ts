/**
 * Laravel-parity validation messages.
 *
 * The Laravel service renders every validation failure as
 *   { success: false, error: <first message>, error_code: 422 }
 * with messages from resources/lang/en/validation.php, where
 * :attribute is the failing field name with underscores replaced by
 * spaces (Illuminate getDisplayableAttribute). Example:
 *   "The email field is required."
 *   "The device id field is required."
 *
 * This factory keeps the historical (localeKey, code) signature used
 * across all validator chains, but builds the message dynamically from
 * express-validator's meta.path instead of a static locale string —
 * so a missing email and a missing password no longer collapse into
 * the same generic text.
 */

interface ValidatorMeta {
    path?: string;
}

/**
 * Mirror of Laravel's getDisplayableAttribute with no custom
 * 'attributes' overrides: underscores become spaces.
 */
const displayableAttribute = (path: string | undefined): string => {
    return String(path ?? "field").replace(/_/g, " ");
};

/**
 * localeKey -> Laravel lang/en/validation.php template. The keys are
 * the historical node-v2 locale codes each rule type used:
 *   1100 notEmpty  -> required
 *   1101 isEmail   -> email
 *   1103 isLength  -> min.string (password, min 8)
 *   1104/1105/1106 -> in / selected invalid
 */
const LARAVEL_TEMPLATES: Record<string, string> = {
    "1100": "The :attribute field is required.",
    "1101": "The :attribute must be a valid email address.",
    "1102": "The email has already been taken.",
    "1103": "The :attribute must be at least 8 characters.",
    "1104": "The selected :attribute is invalid.",
    "1105": "The selected :attribute is invalid.",
    "1106": "The selected :attribute is invalid.",
};

export const localizedError = (localeKey: string, code: number) => {
    return (_: unknown, meta: ValidatorMeta) => {
        const template =
            LARAVEL_TEMPLATES[localeKey] ?? "The :attribute is invalid.";
        const message = template.replace(
            ":attribute",
            displayableAttribute(meta.path),
        );
        return { msg: message, code };
    };
};
