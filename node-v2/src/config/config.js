require("dotenv").config();

const dbConfig = {
    username: process.env.DB_USERNAME || process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || null,
    database: process.env.DB_DATABASE || process.env.DB_NAME || "eficyent",
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    dialect: process.env.DB_DIALECT || "mysql",
};

module.exports = {
    [process.env.NODE_ENV || "development"]: dbConfig,
};
