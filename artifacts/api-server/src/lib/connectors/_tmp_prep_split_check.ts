// One-off, READ-ONLY (2026-11-17): how many recordings the pre-preparedness rule takes OUT of Training - Demos / Readiness, by kind
// (in-training vs after deployment, by FCC's deployment dates), and for one instructor (default NW2000396) the per-course before / after.
//   pnpm exec tsx src/lib/connectors/_tmp_prep_split_check.ts [NW2000396]
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable, instructorContributionTable } from "@workspace/db";
import { config } from "./config";
import { QA_RATING_VIEW, demoKindOf, fetchDemoCourseRows } from "./demoTraining";
import { fetchReadinessEvaluations } from "./trainingReadiness";
import { prepCtes } from "./preparedness";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW2000396").toUpperCase();
  const ref = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}`;
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const t0 = Date.now();
  const [rows] = await bq.query({ query: `WITH ${prepCtes(ref)} SELECT instructor_user_id u, evaluation_type ty, CAST(session_date AS STRING) d FROM prep` });
  const dep = new Map((await db.select().from(instructorContributionTable)).map((c) => [c.instructorUserId, c.deploymentDate]));
  const tally = new Map<string, number>();
  for (const r of rows as Record<string, unknown>[]) {
    const k = demoKindOf(plain(r.ty), plain(r.d).slice(0, 10) || null, { joining: null, deployed: dep.get(plain(r.u)) ?? null });
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  console.log(`Pre-preparedness recordings now left out of Training - Demos (${Math.round((Date.now() - t0) / 1000)}s): ${(rows as unknown[]).length}`);
  for (const [k, n] of [...tally].sort()) console.log(`  would have counted as ${k}: ${n}`);
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  const mine = (rows as Record<string, unknown>[]).filter((r) => plain(r.u) === p?.teachosUserId);
  console.log(`${emp}: ${mine.length} of their recordings are pre-preparedness (${mine.filter((r) => plain(r.ty) === "DEMO").length} demos, ${mine.filter((r) => plain(r.ty) === "AI_ASSESSMENT").length} AI)`);
  // The two real queries with the new exclusion, to be sure they run (nothing stored).
  const t1 = Date.now();
  const demoRows = await fetchDemoCourseRows();
  console.log(`Training - Demos query OK (${Math.round((Date.now() - t1) / 1000)}s): ${demoRows.length} instructor x course x kind rows`);
  const t2 = Date.now();
  const ev = await fetchReadinessEvaluations(true);
  console.log(`Readiness query OK (${Math.round((Date.now() - t2) / 1000)}s): ${[...ev.byUid.values()].reduce((a, l) => a + l.length, 0)} recordings`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
