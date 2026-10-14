// One-off, READ-ONLY (2026-10-14): which BigQuery tables hold anything about our DSA instructors? Lists every table in the
// dataset that has an instructor-id column, with its row count and how many DSA instructors appear in it, plus its columns.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_explore_dataset_for_dsa.ts
import { db, instructorsTable } from "@workspace/db";
import { exploreDatasetForInstructors } from "./instructorLearningStatus";

async function main() {
  const all = await db.select().from(instructorsTable);
  const ids = all.filter((p) => (p.deptArea === "DSA" || p.manualDeptArea === "DSA") && p.teachosUserId && (p.inDarwin || p.inTeachos)).map((p) => p.teachosUserId as string);
  console.log(`DSA instructors with a TeachOS id: ${ids.length}\n`);
  const tables = await exploreDatasetForInstructors(ids);
  tables.sort((a, b) => (b.matched ?? -1) - (a.matched ?? -1));
  for (const t of tables) {
    console.log(`${t.table}  [id column: ${t.idColumn}]  rows: ${t.rows ?? "?"}  DSA instructors found: ${t.matched ?? "?"} of ${ids.length}`);
    console.log(`   columns: ${t.columns.join(", ")}\n`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
