import type { Config } from "drizzle-kit";
const databaseUrl = process.env.DATABASE_URL;
const isGenerate = process.argv.some((arg) => arg === "generate" || arg.endsWith("generate"));
if (!databaseUrl && !isGenerate) {
  throw new Error(
    'DATABASE_URL environment variable is missing. Set DATABASE_URL (e.g. "postgresql://postgres:postgres@host:5432/streamystats").'
  );
}
if (!databaseUrl && isGenerate) {
  // `drizzle-kit generate` does not require a live DB connection, but drizzle-kit still
  // expects a URL in the config shape.
  console.warn(
    '[drizzle] DATABASE_URL missing; using placeholder for "generate" only.'
  );
}

export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      databaseUrl ??
      "postgresql://postgres:postgres@localhost:5432/streamystats",
  },
} satisfies Config;
