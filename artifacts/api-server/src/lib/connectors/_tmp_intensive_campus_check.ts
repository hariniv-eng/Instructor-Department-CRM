// One-off diagnostic (2026-10-05): confirm the EXACT spelling/casing of the
// "Intensive Offline Kukatpally" campus value as it actually appears in the
// live `institutes` data, before adding it to productLabel()'s Intensive
// check in instructors.tsx. Also reports how many live instructors have
// this exact-vs-near value so we know the match will actually hit anyone.
import { db, instructorsTable } from "@workspace/db";

async function main() {
  const rows = await db.select({ institutes: instructorsTable.institutes, fullName: instructorsTable.fullName }).from(instructorsTable);

  const matches = new Map<string, number>();
  for (const row of rows) {
    for (const inst of row.institutes ?? []) {
      if (/intensive/i.test(inst) || /kukatpally/i.test(inst)) {
        matches.set(inst, (matches.get(inst) ?? 0) + 1);
      }
    }
  }

  console.log("=== Distinct institutes values containing 'intensive' or 'kukatpally' (case-insensitive), with counts ===");
  for (const [value, count] of [...matches.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  "${value}" -> ${count} instructor(s)`);
  }
  if (matches.size === 0) console.log("  (none found)");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
