import { drizzle } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

/**
 * Apply SQL migrations to the active driver.
 *  - Local (DB_DRIVER=pglite, default): embedded in-process Postgres file.
 *  - Production (DB_DRIVER=postgres): a real Postgres connection.
 */
async function main() {
  const driver = process.env.DB_DRIVER || "pglite";
  const folder = "./db/migrations";

  if (driver === "postgres") {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });
    await client.end();
  } else {
    const client = new PGlite(process.env.DATABASE_URL || "./.data/sewpress_main");
    const db = drizzlePglite(client);
    await migratePglite(db, { migrationsFolder: folder });
    await client.close();
  }
  console.log(`✅ Migrations applied (driver=${driver}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
