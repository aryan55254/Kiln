import { Pool, PoolConfig } from "pg";
import dotenv from "dotenv";

dotenv.config();

// connecting to db via sticky connection pooling 

const sslCert = process.env.DB_SSL_CA
    ? process.env.DB_SSL_CA.replace(/\\n/g, "\n")
    : undefined;

const config: PoolConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT
        ? parseInt(process.env.DB_PORT, 10)
        : 5432,
    database: process.env.DB_NAME,
    ssl: sslCert
        ? {
              rejectUnauthorized: true,
              ca: sslCert,
          }
        : false,
};

export const db = new Pool(config);

export async function testConnection() {
    try {
        const result = await db.query("SELECT VERSION()");

        console.log("Connected successfully to Aiven PostgreSQL.");
        console.log(result.rows[0].version);
    } catch (error) {
        console.error("Database connection failed:", error);
        throw error;
    }
}