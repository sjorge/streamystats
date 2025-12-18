// Export the database connection
export { db, default as database, closeConnection } from "./connection";

// Export all schema tables and types
export * from "./schema";

// Export migration utilities
export { migrate } from "./migrate";
