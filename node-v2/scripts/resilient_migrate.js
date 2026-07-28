"use strict";

/**
 * Resilient migration sync: runs `sequelize-cli db:migrate` in a loop.
 * When a migration fails ONLY because the table/column/index it creates
 * already exists in the database (ER_TABLE_EXISTS_ERROR,
 * ER_DUP_FIELDNAME, ER_DUP_KEYNAME), the failing migration file is
 * marked as executed by inserting its name into SequelizeMeta — no data
 * is dropped — and the run resumes. Any other failure aborts with the
 * original output.
 *
 * Usage: node scripts/resilient_migrate.js
 * (honours the same DB_* env vars as src/config/config.js)
 */

const { spawnSync } = require("child_process");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ALREADY_EXISTS_PATTERNS = [
    /Table '.*' already exists/i, // ER_TABLE_EXISTS_ERROR
    /Duplicate column name/i, // ER_DUP_FIELDNAME
    /Duplicate key name/i, // ER_DUP_KEYNAME
    /ER_TABLE_EXISTS_ERROR|ER_DUP_FIELDNAME|ER_DUP_KEYNAME/,
];

const runMigrate = () => {
    const result = spawnSync(
        "npx",
        ["sequelize-cli", "db:migrate"],
        { cwd: path.join(__dirname, ".."), encoding: "utf8" },
    );
    return {
        code: result.status ?? 1,
        output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    };
};

const findFailingMigration = (output) => {
    // sequelize-cli prints "== <name>: migrating =======" per attempt;
    // the last one before the error is the failing file.
    const attempts = [...output.matchAll(/== (\S+): migrating/g)];
    const migrated = new Set(
        [...output.matchAll(/== (\S+): migrated/g)].map((m) => m[1]),
    );
    const failing = attempts
        .map((m) => m[1])
        .filter((name) => !migrated.has(name));
    return failing.length > 0 ? failing[failing.length - 1] : null;
};

const markExecuted = async (migrationName) => {
    const mysql = require("mysql2/promise");
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "3306", 10),
        user: process.env.DB_USERNAME || process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
        database:
            process.env.DB_DATABASE || process.env.DB_NAME || "eficyent",
    });
    try {
        await connection.execute(
            "CREATE TABLE IF NOT EXISTS `SequelizeMeta` (`name` VARCHAR(255) NOT NULL, UNIQUE KEY `name` (`name`), PRIMARY KEY (`name`)) ENGINE=InnoDB CHARSET=utf8mb3",
        );
        await connection.execute(
            "INSERT IGNORE INTO `SequelizeMeta` (`name`) VALUES (?)",
            [`${migrationName}.js`.replace(/\.js\.js$/, ".js")],
        );
    } finally {
        await connection.end();
    }
};

const main = async () => {
    const marked = [];
    // Generous upper bound: one skip per migration file at worst.
    for (let round = 1; round <= 200; round += 1) {
        const { code, output } = runMigrate();
        process.stdout.write(output);

        if (code === 0) {
            console.log(
                `\nMigration sync complete after ${round} run(s).` +
                    (marked.length
                        ? ` Marked as already-applied: ${marked.join(", ")}`
                        : " No conflicts encountered."),
            );
            return;
        }

        const alreadyExists = ALREADY_EXISTS_PATTERNS.some((pattern) =>
            pattern.test(output),
        );
        const failing = findFailingMigration(output);
        if (!alreadyExists || !failing) {
            console.error(
                "\nMigration failed with a non-'already exists' error — aborting.",
            );
            process.exit(code);
        }

        console.log(
            `\nSchema object from ${failing} already exists — marking it as executed in SequelizeMeta and resuming...`,
        );
        await markExecuted(failing);
        marked.push(failing);
    }
    console.error("Exceeded maximum retry rounds — aborting.");
    process.exit(1);
};

main().catch((error) => {
    console.error("resilient_migrate failed:", error);
    process.exit(1);
});
