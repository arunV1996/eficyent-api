import fs from "fs";
import path from "path";

/**
 * Loads the locale data from the given directory and locales.
 *
 * @param {string} localesDir - The directory containing the locale files.
 * @param {string[]} locales - The locales to load.
 *
 * @returns {Record<string, any>} - The loaded locale data, with the locale as the key and the locale data as the value.
 */
export const loadLocales = (
    localesDir: string,
    locales: string[],
): Record<string, any> => {
    const catalog: Record<string, any> = {};
    locales.forEach((locale) => {
        const localePath = path.join(localesDir, locale);
        if (!fs.existsSync(localePath)) {
            catalog[locale] = {};
            return;
        }
        const files = fs.readdirSync(localePath);
        catalog[locale] = {};

        files.forEach((file) => {
            if (file.endsWith(".json")) {
                const filePath = path.join(localePath, file);
                try {
                    const fileContent = fs.readFileSync(filePath, "utf-8");
                    const parsedContent = JSON.parse(fileContent);
                    Object.assign(catalog[locale], parsedContent);
                } catch (e: any) {
                    console.error(`Error parsing ${filePath}:`, e.message);
                }
            }
        });
    });
    return catalog;
};
