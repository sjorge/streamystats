"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const connection_1 = require("./connection");
const drizzle_orm_1 = require("drizzle-orm");
async function checkLimits() {
    try {
        const result = await connection_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT 
        setting as max_connections,
        (SELECT count(*) FROM pg_stat_activity) as current_connections
      FROM pg_settings 
      WHERE name = 'max_connections'
    `);
        console.log("Database connection limits:");
        console.log(`  Max connections: ${result[0].max_connections}`);
        console.log(`  Current connections: ${result[0].current_connections}`);
        const maxConn = Number(result[0].max_connections);
        const currentConn = Number(result[0].current_connections);
        const usage = (currentConn / maxConn) * 100;
        console.log(`  Usage: ${usage.toFixed(1)}%`);
        if (usage > 80) {
            console.log("⚠️  High connection usage detected!");
        }
        // Show connections by application
        const appConnections = await connection_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT 
        application_name,
        state,
        count(*) as connection_count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY application_name, state
      ORDER BY connection_count DESC
    `);
        console.log("\nConnections by application:");
        appConnections.forEach((row) => {
            console.log(`  ${row.application_name || "unknown"} (${row.state}): ${row.connection_count}`);
        });
    }
    catch (error) {
        console.error("Error:", error instanceof Error ? error.message : "Unknown error");
    }
    process.exit(0);
}
checkLimits();
//# sourceMappingURL=check-limits.js.map