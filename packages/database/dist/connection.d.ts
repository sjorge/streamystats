import postgres from "postgres";
import * as schema from "./schema";
declare const client: postgres.Sql<{}>;
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{}>;
};
export { client };
export declare const closeConnection: () => Promise<void>;
export default db;
//# sourceMappingURL=connection.d.ts.map