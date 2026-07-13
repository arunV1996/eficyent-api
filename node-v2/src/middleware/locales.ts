import fs from "fs";
import path from "path";

/**
 * Loads locale catalogs from disk for i18n.configure({ staticCatalog }).
 *
 * Each locale directory (e.g. locales/en) may contain one or more JSON
 * files whose keys are merged into a single catalog per locale.
 */
export const loadLocales = (
    localesDirectory: string,
    supportedLocales: string[],
): Record<string, Record<string, string>> => {
    const catalog: Record<string, Record<string, string>> = {};

    supportedLocales.forEach((locale) => {
        catalog[locale] = {};

        const localeDirectoryPath = path.join(localesDirectory, locale);
        if (!fs.existsSync(localeDirectoryPath)) {
            return;
        }

        const localeFiles = fs.readdirSync(localeDirectoryPath);
        localeFiles.forEach((fileName) => {
            if (!fileName.endsWith(".json")) {
                return;
            }
            const filePath = path.join(localeDirectoryPath, fileName);
            try {
                const fileContent = fs.readFileSync(filePath, "utf-8");
                const parsedMessages = JSON.parse(fileContent) as Record<
                    string,
                    string
                >;
                Object.assign(catalog[locale], parsedMessages);
            } catch (parseError) {
                const errorMessage =
                    parseError instanceof Error
                        ? parseError.message
                        : String(parseError);
                // eslint-disable-next-line no-console
                console.error(
                    `Error parsing locale file ${filePath}:`,
                    errorMessage,
                );
            }
        });
    });

    return catalog;
};
