import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dbPortRaw = getRequiredEnv("DB_PORT");
const dbPort = Number.parseInt(dbPortRaw, 10);
if (Number.isNaN(dbPort)) {
  throw new Error(`Invalid DB_PORT value: ${dbPortRaw}`);
}

export const pool = new Pool({
  host: getRequiredEnv("DB_HOST"),
  port: dbPort,
  user: getRequiredEnv("DB_USER"),
  password: getRequiredEnv("DB_PASSWORD"),
  database: getRequiredEnv("DB_NAME"),
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export default pool;
