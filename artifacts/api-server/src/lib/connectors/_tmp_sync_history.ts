// One-off (2026-10-08): why didn't today's 5am auto-sync happen? Read-only.
// Prints the most recent sync records (uploads table) in IST, newest first,
// and the newest record per source.
import { db, uploadsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19) + " IST";

async function main() {
  const rows = await db.select().from(uploadsTable).orderBy(desc(uploadsTable.uploadedAt)).limit(40);
  console.log(`Now: ${ist(new Date())}\n\nLast 40 records (newest first):`);
  for (const r of rows) console.log(`${ist(r.uploadedAt)} | ${r.source} | ${r.rowCount} rows | ${r.filename}`);
  const seen = new Set<string>();
  console.log("\nNewest per source:");
  for (const r of rows) {
    if (seen.has(r.source)) continue;
    seen.add(r.source);
    console.log(`${r.source}: ${ist(r.uploadedAt)}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
