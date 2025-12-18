import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dotenv from "dotenv";
import * as schema from "./schema";

// Ensure environment variables are loaded
dotenv.config();

const getConnectionString = () => {
  return process.env.DATABASE_URL!;
};

// Create postgres client with connection pooling for self-hosted environment
const client = postgres(getConnectionString(), {
  max: 20, // Maximum number of connections in the pool
  idle_timeout: 20, // Close connections after 20 seconds of inactivity
  max_lifetime: 60 * 30, // Maximum lifetime of a connection (30 minutes)
  connect_timeout: 60,
});

// Create Drizzle database instance
export const db = drizzle(client, { schema });

// Export the client for cleanup if needed
export { client };

// Graceful shutdown helper
export const closeConnection = async () => {
  try {
    await client.end();
    console.log("Database connection closed successfully");
  } catch (error) {
    console.error("Error closing database connection:", error);
  }
};

export default db;
