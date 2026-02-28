import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "qwerty",
  database: process.env.DB_NAME || "itsystems_db",
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export default pool;
