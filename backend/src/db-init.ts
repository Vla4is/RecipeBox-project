import { Client } from "pg";
import dotenv from "dotenv";
import createTables from "./migrations";

dotenv.config();

const dbName = process.env.DB_NAME || "itsystems_db";
const dbUser = process.env.DB_USER || "postgres";
const dbPassword = process.env.DB_PASSWORD || "qwerty";
const dbHost = process.env.DB_HOST || "localhost";
const dbPort = parseInt(process.env.DB_PORT || "5432");

// Connect to default postgres database to create our database
const client = new Client({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: "postgres", // Connect to default database first
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
