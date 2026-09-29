import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"));
} catch {
  // ignore if already loaded another way
}

async function main() {
  const { db, instructorsTable } = await import("@workspace/db");

  const rows = await db.select({
    fullName: instructorsTable.fullName,
    enrolledPlans: instructorsTable.enrolledPlans,
    lastSyncedAt: instructorsTable.id, // placeholder, real timestamp column checked below if present
  }).from(instructorsTable);

  console.log(`Total rows in live instructorsTable: ${rows.length}`);
  const nonNull = rows.filter((r) => r.enrolledPlans !== null);
  console.log(`Rows with non-null enrolledPlans: ${nonNull.length}`);

  const academyMatches = rows.filter((r) => (r.enrolledPlans ?? "").includes("CCBP_ACADEMY_GENIUS_CAREER_PLUS"));
  console.log(`Rows whose enrolledPlans contains CCBP_ACADEMY_GENIUS_CAREER_PLUS: ${academyMatches.length}`);
  for (const r of academyMatches) {
    console.log(`  - ${r.fullName} | enrolledPlans=${JSON.stringify(r.enrolledPlans)}`);
  }

  console.log(`\nFirst 10 non-null enrolledPlans values as currently stored in Postgres (to check format/shape):`);
  for (const r of nonNull.slice(0, 10)) {
    console.log(`  - ${r.fullName} | ${JSON.stringify(r.enrolledPlans)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
