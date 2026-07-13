import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import dotenv from "dotenv";
import path from "path";
import i18n from "i18n";
import { loadLocales } from "./middleware/locales";
import sequelize from "./config/database";
import "./models/user.model";
import "./models/wallet.model";
import "./models/currency.model";
import "./models/transaction.model";
import routes from "./routes";
import { initJobs } from "./jobs";
declare global {
    namespace Express {
        interface Response {
            sendResponse: (data: any, message: string, code?: number) => void;
            sendError: (ex: any, ex_code?: number) => void;
            handleError: (error: any) => void;
        }
    }
}

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const locales = ["en", "hi"];
const localesDir = path.join(__dirname, "locales");
const staticCatalog = loadLocales(localesDir, locales);

i18n.configure({
    locales,
    defaultLocale: "en",
    staticCatalog,
    objectNotation: true,
    queryParameter: "lang",
});

app.use(i18n.init);

app.use((req, res, next) => {
    let rawLang = req.headers["language"];
    const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang || "";
    if (locales.includes(lang)) {
        i18n.setLocale(req, lang);
    } else {
        i18n.setLocale(req, "en");
    }
    next();
});

/**
 * SECURITY STANDARD 1: Trust Proxy (behind ALB, Nginx, Cloudflare, etc.)
 * Ensures that client IP addresses are correctly extracted from headers (like X-Forwarded-For)
 * rather than displaying the IP of the reverse proxy itself. Essential for rate limiting accuracy.
 */
if (isProduction) {
    app.set("trust proxy", 1);
}

/**
 * SECURITY STANDARD 2: Helmet
 * Configures secure HTTP headers to mitigate cross-site scripting (XSS), clickjacking,
 * MIME-type sniffing, and other vulnerabilities.
 */
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
            maxAge: 31536000, // 1 year in seconds
            includeSubDomains: true,
            preload: true,
        },
        ieNoOpen: true,
        noSniff: true,
        referrerPolicy: { policy: "no-referrer" },
        xssFilter: true,
    }),
);

/**
 * SECURITY STANDARD 3: CORS (Cross-Origin Resource Sharing)
 * Restricts cross-origin requests. Always avoid wildcard '*' in production.
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000"];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1 || !isProduction) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        credentials: true,
        optionsSuccessStatus: 200,
    }),
);

/**
 * SECURITY STANDARD 4: Disabling X-Powered-By Header
 * Removes the signature identifying the server framework (Express) to prevent target profiling.
 */
app.disable("x-powered-by");

/**
 * SECURITY STANDARD 5: Payload Limits
 * Restricts payload sizes to prevent Denial of Service (DoS) attacks through massive body sizes.
 */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

/**
 * SECURITY STANDARD 6: HTTP Parameter Pollution (HPP)
 * Prevents parameter pollution attacks (e.g., repeating query parameters like ?user=1&user=2).
 */
app.use(hpp());

/**
 * SECURITY STANDARD 7: Global Rate Limiting
 * Defends against brute-force and Denial of Service (DoS) attacks.
 */
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        status: "fail",
        message:
            "Too many requests from this IP, please try again after 15 minutes.",
    },
});
app.use("/api", limiter);
app.use("/api", routes);

// Basic health check route
app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
        status: "success",
        message: "Server is healthy.",
        timestamp: new Date().toISOString(),
    });
});

/**
 * SECURITY STANDARD 8: Route Guard / 404 Handler
 * Returns standard JSON response instead of default HTML page for non-existent routes.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({
        status: "fail",
        message: `Route ${req.originalUrl} not found.`,
    });
});

/**
 * SECURITY STANDARD 9: Centralized Error Handler
 * Sanitizes server responses. Stack traces are never exposed in production.
 */
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const status = err.status || "error";

    res.status(statusCode).json({
        status,
        message: isProduction ? "An unexpected error occurred." : err.message,
        ...(isProduction ? {} : { stack: err.stack }),
    });
});

// Database connection & startup logic
const startServer = async () => {
    try {
        // Test the Sequelize database connection
        await sequelize.authenticate();
        console.log("Database connected successfully.");

        // Sync database models (safety option: sync without dropping tables)
        await sequelize.sync({ alter: !isProduction });
        console.log("Database models synchronized successfully.");

        // Initialize background jobs
        await initJobs();

        app.listen(PORT, () => {
            console.log(
                `Server running securely on port ${PORT} in ${process.env.NODE_ENV || "development"} mode.`,
            );
        });
    } catch (error) {
        console.error("Database connection failed:", error);
        process.exit(1);
    }
};

startServer();
