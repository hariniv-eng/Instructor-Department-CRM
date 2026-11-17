// One-off, READ-ONLY (2026-11-17): runs the new pre-preparedness query (fetchEvaluationDailyRows) WITHOUT storing anything -- totals,
// and one instructor's rows (default NW2000396) -- so the query can be checked before Publish + Contribution Sync Now.
//   pnpm exec tsx src/lib/connectors/_tmp_prep_demo_preview.ts [NW2000396]
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { fetchEvaluationDailyRows } from "./instructorEvaluations";

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW2000396").toUpperCase();
  const t0 = Date.now();
  const rows = await fetchEvaluationDailyRows();
  const sum = (ty: string, k: "evaluations" | "seconds") => rows.filter((r) => r.evaluation_type === ty).reduce((a, r) => a + r[k], 0);
  console.log(`Query took ${Math.round((Date.now() - t0) / 1000)}s | ${rows.length} instructor-day rows | ${new Set(rows.map((r) => r.instructor_user_id)).size} instructors`);
  console.log(`Prep demos ${sum("DEMO", "evaluations")} (${Math.round(sum("DEMO", "seconds") / 360) / 10} h) | prep AI assessments ${sum("AI_ASSESSMENT", "evaluations")} (${Math.round(sum("AI_ASSESSMENT", "seconds") / 360) / 10} h)`);
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  for (const r of rows.filter((x) => x.instructor_user_id === p?.teachosUserId).sort((a, b) => b.session_date.localeCompare(a.session_date)).slice(0, 15))
    console.log(`  ${emp} ${r.session_date} ${r.evaluation_type} x${r.evaluations} ${Math.round(r.seconds / 6) / 10} min, avg ${r.scored ? Math.round((r.score_sum / r.scored) * 10) / 10 : "-"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
