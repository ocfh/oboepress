import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

/**
 * Run ad-hoc SQL against the active database and print the rows as a table.
 * `drizzle-kit studio` cannot open an embedded pglite directory, so this is the
 * quickest way to inspect local state while debugging.
 *
 *   npm run db:sql -- "select id, email, role from users"
 *   npm run db:sql -- "select slug, config from themes"
 *   npm run db:sql -- "select * from site_settings"
 *
 * Only one statement at a time; anything valid in Postgres works.
 */

async function main() {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Usage: npm run db:sql -- "select * from users"');
    process.exit(1);
  }

  const driver = process.env.DB_DRIVER || "pglite";
  let rows: unknown[];

  if (driver === "postgres") {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    rows = await client.unsafe(query);
    await client.end();
  } else {
    const client = new PGlite(process.env.DATABASE_URL || "./.data/oboepress");
    const result = await client.query(query);
    rows = result.rows;
    await client.close();
  }

  if (!rows.length) {
    console.log("(0 rows)");
  } else {
    console.table(rows);
    console.log(`(${rows.length} row${rows.length === 1 ? "" : "s"})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Query failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
