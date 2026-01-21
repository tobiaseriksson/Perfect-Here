import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Force the pg driver to parse TIMESTAMPS (OID 1114) as UTC
pg.types.setTypeParser(1114, (stringValue) => {
  return new Date(stringValue + "+0000");
});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=utc"
});
export const db = drizzle(pool, { schema });
