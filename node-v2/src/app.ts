import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import i18n from "i18n";
import path from "path";
import sequelize from "./config/database";
import { loadLocales } from "./middleware/locales";
import { responseHelpers } from "./middleware/responseHelpers";
import "./models/beneficiary_account.model";
import "./models/beneficiary_account_validation.model";
import "./models/beneficiary_additional_detail.model";
import "./models/beneficiary_transaction.model";
import "./models/beneficiary_transaction_status_history.model";
import "./models/deposit_transaction.model";
import "./models/external_service_call.model";
import "./models/fee.model";
import "./models/fx_rate.model";
import "./models/ledger.model";
import "./models/lookup.model";
import "./models/merchant.model";
import "./models/service_bank.model";
import "./models/supported_country.model";
import "./models/merchant_setting.model";
import "./models/mobile_country_code.model";
import "./models/password_reset_token.model";
import "./models/payout_job.model";
import "./models/personal_access_token.model";
import "./models/quote.model";
import "./models/sender.model";
import "./models/setting.model";
import "./models/state.model";
import "./models/user.model";
import "./models/user_document.model";
import "./models/user_information.model";
import "./models/virtual_account.model";
import "./models/wallet.model";
import "./models/wallet_transaction.model";
import apiRoutes from "./routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === "production";

// -----------------------------------------------------------------------------
// Internationalization
// -----------------------------------------------------------------------------
const supportedLocales = ["en", "hi"];
const localesDirectory = path.join(__dirname, "locales");
const staticCatalog = loadLocales(localesDirectory, supportedLocales);

i18n.configure({
    locales: supportedLocales,
    defaultLocale: "en",
    staticCatalog,
    objectNotation: true,
    queryParameter: "lang",
});

app.use(i18n.init);

app.use((req: Request, _res: Response, next: NextFunction) => {
    const rawLanguageHeader = req.headers["language"];
    const requestedLocale = Array.isArray(rawLanguageHeader)
        ? rawLanguageHeader[0]
        : rawLanguageHeader || "";

    if (supportedLocales.includes(requestedLocale)) {
        i18n.setLocale(req, requestedLocale);
    } else {
        i18n.setLocale(req, "en");
    }
    next();
});

// -----------------------------------------------------------------------------
// Security middleware (matches the ordering used in sample-project/app.ts)
// -----------------------------------------------------------------------------
if (isProduction) {
    app.set("trust proxy", 1);
}

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: "same-origin" },
        dnsPrefetchControl: { allow: false },
        frameguard: { action: "deny" },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        ieNoOpen: true,
        noSniff: true,
        referrerPolicy: { policy: "no-referrer" },
        xssFilter: true,
    }),
);

// Mirror of the legacy corsMiddleware: comma-separated origin
// allowlist, identical in every environment (no dev bypass).
// CORS_ORIGINS matches the legacy setting name; ALLOWED_ORIGINS is
// kept as a fallback for existing deployments.
const allowedOrigins = (
    process.env.CORS_ORIGINS ||
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000"
)
    .split(",")
    .map((originEntry) => originEntry.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow same-origin / non-browser requests (no Origin header).
            if (!origin) {
                return callback(null, true);
            }
            callback(null, allowedOrigins.includes(origin));
        },
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Request-Id",
            "X-Merchant-Id",
            "X-Merchant-Signature",
            "Idempotency-Key",
            "X-Api-Key",
            "X-Api-Timestamp",
            "X-Api-Signature",
            "X-Api-Language",
            "X-Api-Device-Id",
        ],
        credentials: true,
        optionsSuccessStatus: 200,
    }),
);

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "1mb",
        // Capture the raw bytes so webhook signature middleware (FvBank
        // HMAC etc.) can verify against the exact payload the provider
        // signed — re-stringifying via JSON.stringify can drift on
        // whitespace/key-order otherwise.
        verify: (verifyRequest, _verifyResponse, rawBuffer) => {
            (verifyRequest as unknown as { rawBody?: Buffer }).rawBody =
                Buffer.from(rawBuffer);
        },
    }),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(hpp());

const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: false,
        code: 429,
        message:
            "Too many requests from this IP, please try again after 15 minutes.",
        data: null,
    },
});

app.use("/api", apiRateLimiter);
app.use(responseHelpers);
app.use("/api", apiRoutes);

// -----------------------------------------------------------------------------
// Health, 404, error handler
// -----------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
    res.sendResponse(null, "ok", 200);
});

app.use((req: Request, res: Response) => {
    res.status(404).json({
        status: false,
        code: 404,
        message: `Route ${req.originalUrl} not found`,
        data: null,
    });
});

app.use(
    (
        error: Error,
        _req: Request,
        res: Response,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _next: NextFunction,
    ) => {
        // eslint-disable-next-line no-console
        console.error("Unhandled error:", error);
        res.status(500).json({
            status: false,
            code: 500,
            message: isProduction
                ? "An unexpected error occurred."
                : error.message,
            data: null,
        });
    },
);

// -----------------------------------------------------------------------------
// Server startup
// -----------------------------------------------------------------------------
const startServer = async (): Promise<void> => {
    try {
        await sequelize.authenticate();
        // eslint-disable-next-line no-console
        console.log("Database connection established successfully.");

        app.listen(PORT, () => {
            // eslint-disable-next-line no-console
            console.log(
                `eficyent-api-v2 listening on port ${PORT} (${
                    process.env.NODE_ENV || "development"
                })`,
            );
        });
    } catch (startupError) {
        // eslint-disable-next-line no-console
        console.error("Failed to start server:", startupError);
        process.exit(1);
    }
};

startServer();
