import { ensureBootstrap } from "@/lib/services/bootstrap";

/**
 * Seed script. No default accounts are created — on first run the app shows a
 * setup wizard (/admin/setup) where the owner creates the admin account and
 * site identity. This script only ensures the built-in themes + site settings
 * exist (idempotent).
 */
async function main() {
  console.log("🌱 Bootstrapping OboePress (themes + site settings)…");
  await ensureBootstrap();
  console.log("✅ Done. Start the app and visit /admin to finish first-run setup.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
