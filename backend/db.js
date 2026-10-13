
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_NAME || "collaborative_docs",
    password: process.env.DB_PASSWORD || "admin",
    port: Number(process.env.DB_PORT) || 5432
});

pool.on("error", (err) => {
    console.error("Erreur PostgreSQL :", err.message);
});

module.exports = pool;