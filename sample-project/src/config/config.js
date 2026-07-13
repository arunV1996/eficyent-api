require("dotenv").config();

const dbConfig = {
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASS || null,
    database: process.env.DB_NAME || "sample_db",
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    dialect: process.env.DB_DIALECT || "mysql",
};

// Exports only the single current environment matching NODE_ENV (defaulting to 'development')
module.exports = {
    [process.env.NODE_ENV || "development"]: dbConfig,
};
