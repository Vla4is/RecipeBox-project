import { Client } from "pg";
import dotenv from "dotenv";
import createTables from "./migrations";

dotenv.config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const dbName = getRequiredEnv("DB_NAME");
const dbUser = getRequiredEnv("DB_USER");
const dbPassword = getRequiredEnv("DB_PASSWORD");
const dbHost = getRequiredEnv("DB_HOST");
const dbMaintenanceDatabase = getRequiredEnv("DB_MAINTENANCE_DB");
const dbPortRaw = getRequiredEnv("DB_PORT");
const dbPort = Number.parseInt(dbPortRaw, 10);

if (Number.isNaN(dbPort)) {
  throw new Error(`Invalid DB_PORT value: ${dbPortRaw}`);
}

// Connect to default postgres database to create our database
const client = new Client({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbMaintenanceDatabase,
});

async function initializeDatabase() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL server");

    // Check if database exists
    const result = await client.query(
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)`,
      [dbName]
    );

    const dbExists = result.rows[0].exists;

    if (!dbExists) {
      console.log(`Database '${dbName}' does not exist. Creating...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created successfully!`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }

    await client.end();
    
    // Create tables
    await createTables();
    
    return true;
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

export default initializeDatabase;
