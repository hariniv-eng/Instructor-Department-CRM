// One-off (2026-10-15): finds out why the Demo / AI Assessment hours columns on the Contribution tab are empty.
// 1) is the table there and does it have rows, 2) does the BigQuery fetch work and how many rows come back, 3) do the BigQuery
// instructor ids match the TeachOS ids of the people on the Contribution tab.
// READ-ONLY by default. Add --apply to also store the fetched rows into instructor_evaluation_daily (the only thing it writes), which
// does the same as the evaluation step of Sync Now without running the rest of the Contribution sync.
// Run in the Replit shell from artifacts/api-server:
//   pnpm exec tsx src/lib/connectors/_tmp_eval_hours_check.ts
//   pnpm exec tsx src/lib/connectors/_tmp_eval_hours_check.ts --apply
import { db, instructorsTable, instructorEvaluationDailyTable } from "@workspace/db";
import { fetchEvaluationDailyRows } from "./instructorEvaluations";
import { storeEvaluationDaily } from "../storeRaw";

async function main() {
  console.log("=== 1. Table instructor_evaluation_daily ===");
  try {
    const rows = await db.select().from(instructorEvaluationDailyTable);
    console.log(`OK: table exists, ${rows.length} rows stored${rows.length ? `, last synced ${rows[0].syncedAt.toISOString()}` : " (empty -- the sync step has not stored anything yet)"}`);
  } catch (e) {
    console.log(`FAILED reading the table: ${(e as Error).message.slice(0, 300)}\n  -> the database push has not been run. Run: pnpm --filter @workspace/db run push`);
  }

  console.log("\n=== 2. BigQuery fetch ===");
  let fetched: Awaited<ReturnType<typeof fetchEvaluationDailyRows>> = [];
  try {
    fetched = await fetchEvaluationDailyRows();
    const ids = new Set(fetched.map((r) => r.instructor_user_id));
    const demo = fetched.filter((r) => r.evaluation_type === "DEMO");
    const ai = fetched.filter((r) => r.evaluation_type === "AI_ASSESSMENT");
    const hrs = (rs: typeof fetched) => Math.round(rs.reduce((s, r) => s + r.seconds, 0) / 36) / 100;
    console.log(`OK: ${fetched.length} day-rows, ${ids.size} instructors. Demo: ${demo.length} rows, ${hrs(demo)} h. AI assessment: ${ai.length} rows, ${hrs(ai)} h.`);
    console.log("Sample:", JSON.stringify(fetched.slice(0, 3)));
  } catch (e) {
    console.log(`FAILED: ${(e as Error).message.slice(0, 600)}`);
  }

  console.log("\n=== 3. Do the ids match the TeachOS ids on the Contribution tab? ===");
  const people = await db.select({ name: instructorsTable.fullName, teachosUserId: instructorsTable.teachosUserId, inTeachos: instructorsTable.inTeachos }).from(instructorsTable);
  const tIds = new Set(people.filter((p) => p.inTeachos && p.teachosUserId).map((p) => p.teachosUserId!));
  const bqIds = new Set(fetched.map((r) => r.instructor_user_id));
  const matched = [...bqIds].filter((id) => tIds.has(id));
  console.log(`BigQuery instructors ${bqIds.size}; TeachOS people in the app ${tIds.size}; matched ${matched.length}.`);
  const unmatched = [...bqIds].filter((id) => !tIds.has(id));
  if (unmatched.length) console.log(`Not matched (first 8 ids): ${unmatched.slice(0, 8).join(", ")}`);

  if (process.argv.includes("--apply")) {
    if (!fetched.length) { console.log("\nNothing fetched, nothing stored."); process.exit(1); }
    const n = await storeEvaluationDaily(fetched);
    console.log(`\nStored ${n} rows in instructor_evaluation_daily. Refresh the Contribution tab.`);
  } else {
    console.log("\nRead-only run. Add --apply to store the fetched rows.");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
