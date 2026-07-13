import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const dbHost = process.env.DB_HOST || "localhost";
const dbPort = parseInt(process.env.DB_PORT || "3306", 10);
const dbUser = process.env.DB_USER || "root";
const dbPass = process.env.DB_PASS || "";
const dbName = process.env.DB_NAME || "sample_db";
const dbDialect = (process.env.DB_DIALECT as any) || "mysql";
const isProduction = process.env.NODE_ENV === "production";

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: dbDialect,
    // Security standard: Disable logging in production to prevent leaking sensitive parameter values in logs.
    logging: isProduction ? false : console.log,
    timezone: "+00:00", // Standardize to UTC timezone
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        // Security standard: Always use timestamps to track when rows were created and updated
        timestamps: true,
        // Freeze table name to prevent Sequelize from renaming tables
        freezeTableName: true,
    },
});

export default sequelize;
