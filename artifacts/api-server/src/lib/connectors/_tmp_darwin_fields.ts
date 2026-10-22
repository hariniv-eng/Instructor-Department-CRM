// One-off, READ-ONLY (2026-10-22, per request: "don't we have the HOD name?"). Lists EVERY field stored for the Darwin full roster
// (after the sync that keeps all Darwin fields), with how many employees have a value and a sample value -- to find which field, if
// any, holds the Head of Department. Fields whose name or values look like head / HOD / manager / leader are flagged. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_darwin_fields.ts
import { db, darwinboxFullRosterTable } from "@workspace/db";

async function main() {
  const rows = await db.select().from(darwinboxFullRosterTable);
  console.log(`Full roster rows: ${rows.length} | synced ${rows[0]?.syncedAt?.toISOString() ?? "-"}\n`);
  const stats = new Map<string, { n: number; sample: string }>();
  for (const r of rows) {
    for (const [k, v] of Object.entries((r.rawData as Record<string, unknown>) ?? {})) {
      const s = stats.get(k) ?? { n: 0, sample: "" };
      if (v !== null && v !== undefined && String(v).trim() !== "") { s.n++; if (!s.sample) s.sample = String(v).slice(0, 80); }
      stats.set(k, s);
    }
  }
  console.log(`Fields: ${stats.size}  (if this is about 16, the sync with all Darwin fields has not run yet -- Publish, then Sync Now for Darwin)\n`);
  const flag = /hod|head|manager|leader|lead|reporting|l1|l2|supervisor|owner|business_unit|bu_|function|vertical/i;
  for (const [k, s] of [...stats].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${flag.test(k) ? ">> " : "   "}${k} | filled for ${s.n} | e.g. ${s.sample || "-"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
