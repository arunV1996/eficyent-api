import { Dialect, Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const databaseHost = process.env.DB_HOST || "127.0.0.1";
const databasePort = parseInt(process.env.DB_PORT || "3306", 10);
const databaseUser = process.env.DB_USERNAME || process.env.DB_USER || "root";
const databasePassword = process.env.DB_PASSWORD || process.env.DB_PASS || "";
const databaseName = process.env.DB_DATABASE || process.env.DB_NAME || "eficyent";
const databaseDialect = (process.env.DB_DIALECT as Dialect | undefined) || "mysql";

const sequelize = new Sequelize(databaseName, databaseUser, databasePassword, {
    host: databaseHost,
    port: databasePort,
    dialect: databaseDialect,
    // SQL queries are never printed to the terminal — request-level
    // logging is handled by the morgan pipeline in middleware/request_logger.
    logging: false,
    timezone: "+00:00",
    pool: {
        max: parseInt(process.env.DB_POOL_MAX || "10", 10),
        min: parseInt(process.env.DB_POOL_MIN || "0", 10),
        acquire: parseInt(process.env.DB_POOL_ACQUIRE || "30000", 10),
        idle: parseInt(process.env.DB_POOL_IDLE || "10000", 10),
    },
    define: {
        timestamps: true,
        freezeTableName: true,
        underscored: true,
    },
});

export default sequelize;
