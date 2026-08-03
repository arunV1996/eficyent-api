import ejs from "ejs";
import fs from "fs";
import path from "path";

// Puppeteer ships as an ES module in newer releases, so a top-level
// require/import crashes CommonJS builds with ERR_REQUIRE_ESM. It is
// loaded lazily via a true dynamic import instead — new Function keeps
// tsc (module: commonjs) from transpiling import() into require().
const importPuppeteer = new Function(
    'return import("puppeteer");',
) as () => Promise<{ default?: unknown }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPuppeteer: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadPuppeteer = async (): Promise<any> => {
    if (!cachedPuppeteer) {
        const puppeteerModule = await importPuppeteer();
        cachedPuppeteer = puppeteerModule.default || puppeteerModule;
    }
    return cachedPuppeteer;
};

/**
 * Shared PDF-report machinery for the deposits / ledgers / payout list
 * exports (mirror of the inline logic in the legacy deposit and ledger
 * controllers — logo resolution, EJS render, puppeteer A4 print).
 */

/**
 * Resolves the report logo as a base64 data URL, trying the same path
 * fallbacks the legacy controllers walked (src tree, dist tree, cwd),
 * and finally falling back to the APP_URL-hosted asset.
 */
export const loadLogoDataUrl = (): string => {
    const logoPaths = [
        path.join(__dirname, "..", "..", "public", "logo", "eficyent-logo-dark.png"),
        path.join(process.cwd(), "public", "logo", "eficyent-logo-dark.png"),
        path.join(process.cwd(), "dist", "public", "logo", "eficyent-logo-dark.png"),
    ];
    for (const logoPath of logoPaths) {
        if (fs.existsSync(logoPath)) {
            try {
                const logoBase64 = fs.readFileSync(logoPath).toString("base64");
                return `data:image/png;base64,${logoBase64}`;
            } catch {
                // Ignored — try the next path.
            }
        }
    }
    return `${process.env.APP_URL || `http://localhost:${process.env.PORT || 8080}`}/logo/eficyent-logo-dark.png`;
};

/**
 * Renders an EJS template from src/views (dist/views at runtime) with
 * the given locals and returns the HTML.
 */
export const renderViewTemplate = async (
    relativeTemplatePath: string,
    locals: Record<string, unknown>,
): Promise<string> => {
    const templatePath = path.join(
        __dirname,
        "..",
        "views",
        relativeTemplatePath,
    );
    const templateHtml = await fs.promises.readFile(templatePath, "utf-8");
    return ejs.render(templateHtml, locals);
};

/**
 * Prints HTML to an A4 PDF via headless Chrome — identical launch args
 * and margins to the legacy controllers. PUPPETEER_EXECUTABLE_PATH is
 * honored automatically by puppeteer when a system Chrome is preferred.
 */
export const renderPdfFromHtml = async (html: string): Promise<Buffer> => {
    const puppeteer = await loadPuppeteer();
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html);
        const pdfBytes = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "30px",
                right: "30px",
                bottom: "30px",
                left: "30px",
            },
        });
        return Buffer.from(pdfBytes);
    } finally {
        await browser.close();
    }
};

/** Report-date stamp in the legacy MM/DD/YYYY shape. */
export const formatReportDate = (): string => {
    const today = new Date();
    return `${String(today.getMonth() + 1).padStart(2, "0")}/${String(
        today.getDate(),
    ).padStart(2, "0")}/${today.getFullYear()}`;
};
