import { Dialect, Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const databaseHost = process.env.DB_HOST || "127.0.0.1";
const databasePort = parseInt(process.env.DB_PORT || "3306", 10);
const databaseUser = process.env.DB_USERNAME || process.env.DB_USER || "root";
const databasePassword = process.env.DB_PASSWORD || process.env.DB_PASS || "";
const databaseName = process.env.DB_DATABASE || process.env.DB_NAME || "eficyent";
const databaseDialect = (process.env.DB_DIALECT as Dialect | undefined) || "mysql";
const isProduction = process.env.NODE_ENV === "production";

const sequelize = new Sequelize(databaseName, databaseUser, databasePassword, {
    host: databaseHost,
    port: databasePort,
    dialect: databaseDialect,
    logging: isProduction ? false : console.log,
    timezone: "+00:00",
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
    define: {
        timestamps: true,
        freezeTableName: true,
        underscored: true,
    },
});

export default sequelize;
