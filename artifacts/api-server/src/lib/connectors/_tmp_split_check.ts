import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");

  const rows = await db.select().from(instructorsTable).where(and(eq(instructorsTable.inTeachos, true), eq(instructorsTable.inDarwin, false)));

  console.log(`Current "TeachOS only" (inTeachos && !inDarwin) rows: ${rows.length}`);

  const withFullRoster = rows.filter((r) => r.inDarwinFullRoster);
  const withoutFullRoster = rows.filter((r) => !r.inDarwinFullRoster);

  console.log(`  - of these, inDarwinFullRoster = true (matched Darwin's broader roster, just not the primary sheet): ${withFullRoster.length}`);
  console.log(`  - of these, inDarwinFullRoster = false (genuinely no Darwin record anywhere): ${withoutFullRoster.length}`);

  console.log(`\nBreakdown of the ${withFullRoster.length} full-roster-matched rows, by classification:`);
  const byClassification = new Map<string, number>();
  for (const r of withFullRoster) {
    const key = r.classification ?? "null";
    byClassification.set(key, (byClassification.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byClassification) console.log(`  - ${key}: ${count}`);

  console.log(`\nNames of the full-roster-matched rows (these are the ones that would move out of "TeachOS only" under a fix):`);
  for (const r of withFullRoster) {
    console.log(`  - ${r.fullName} | classification=${r.classification} | department=${r.department}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
