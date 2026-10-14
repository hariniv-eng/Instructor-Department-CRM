// One-off, READ-ONLY (2026-10-14): verifies the daily 5 AM IST sync really ran, per source, for each of the last 14 days.
// Writes nothing. Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_sync_reliability_check.ts
import { db, uploadsTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";

const IST_MS = 5.5 * 3600 * 1000;
const istDay = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istTime = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(11, 16);

async function main() {
  const since = new Date(Date.now() - 15 * 24 * 3600 * 1000);
  const rows = await db.select().from(uploadsTable).where(gte(uploadsTable.uploadedAt, since)).orderBy(desc(uploadsTable.uploadedAt));
  const sources = [...new Set(rows.map((r) => r.source))].sort();
  const days: string[] = [];
  for (let i = 0; i < 14; i++) days.push(istDay(new Date(Date.now() - i * 24 * 3600 * 1000)));
  console.log(`Now: ${istDay(new Date())} ${istTime(new Date())} IST. Cell = first successful sync time (IST) that day and rows; "-" = no sync recorded.\n`);
  for (const s of sources) {
    console.log(`=== ${s} ===`);
    let missed = 0;
    for (const day of days) {
      const hits = rows.filter((r) => r.source === s && istDay(r.uploadedAt) === day).sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      if (!hits.length) { missed++; console.log(`${day}  -`); continue; }
      const first = hits[0];
      const late = istTime(first.uploadedAt) > "06:30" ? "  (after the 5 AM window: catch-up or manual)" : "";
      console.log(`${day}  ${istTime(first.uploadedAt)}  ${first.rowCount} rows${hits.length > 1 ? `  (+${hits.length - 1} more that day)` : ""}${late}`);
    }
    console.log(`Days with no sync in the last 14: ${missed}\n`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
