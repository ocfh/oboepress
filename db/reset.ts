import { drizzle } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

/**
 * Reset the database back to a pristine, first-run state:
 * drop every table, re-apply migrations, seed nothing.
 *
 * After running this, opening /admin shows the setup wizard again — handy when
 * you want to re-test the first-run flow while debugging locally.
 *
 *   npm run db:reset
 *
 * Safety: refuses to touch a real Postgres database (DB_DRIVER=postgres)
 * unless you pass --force, so a stray command can never wipe production.
 */

const DROP_ALL = `
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
`;

async function main() {
  const driver = process.env.DB_DRIVER || "pglite";
  const folder = "./db/migrations";
  const forced = process.argv.includes("--force");

  if (driver === "postgres" && !forced) {
    console.error(
      "❌ Refusing to reset a remote Postgres database.\n" +
        "   This drops every table. If you really mean it, re-run with --force.",
    );
    process.exit(1);
  }

  if (driver === "postgres") {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    await client.unsafe(DROP_ALL);
    await migrate(drizzle(client), { migrationsFolder: folder });
    await client.end();
  } else {
    const url = process.env.DATABASE_URL || "./.data/sewpress_main";
    const client = new PGlite(url);
    await client.exec(DROP_ALL);
    await migratePglite(drizzlePglite(client), { migrationsFolder: folder });
    await client.close();
    console.log(`   data dir: ${url}`);
  }

  console.log(
    `✅ Database reset (driver=${driver}). No users left — /admin will show the setup wizard.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
