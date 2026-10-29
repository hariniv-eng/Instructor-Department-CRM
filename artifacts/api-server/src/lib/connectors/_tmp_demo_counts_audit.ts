// One-off, READ-ONLY (2026-10-29, per request: "go through the demo / training demo data again and get the exact count of demos each
// instructor has given"). For every instructor in niat_session_wise_qa_rating with DEMO or TRAINING_DEMO rows, counts straight from
// BigQuery: all demos, completed demos, failed / other, average score of completed -- separately for DEMO and TRAINING_DEMO -- and how many
// of their completed demos the Demos tab counts (matched to a lecture of the list) vs not (topic not in the lecture list, with the
// topics). Also checks the Demos tab's stored data (instructor_demo_course) against this live count, per instructor, so any difference
// shows. Console: totals + differences (no names). Full per-instructor list WITH names: demo_counts_audit.csv (delete after download).
//   pnpm exec tsx src/lib/connectors/_tmp_demo_counts_audit.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable, instructorDemoCourseTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { QA_RATING_VIEW, lectureNameIndex, matchDemoTopic, fetchDemoCourseRows } from "./demoTraining";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS uid, instructor_name AS name, evaluation_type AS ty,
      LOWER(status) AS st, final_score AS s, session_title AS t, CAST(session_date AS STRING) AS d, evaluation_id AS eid
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.${QA_RATING_VIEW}\` WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO')` });
  const R = rows as Record<string, unknown>[];
  const idx = lectureNameIndex();
  const people = await db.select().from(instructorsTable);
  const crm = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  type P = { name: string; d_all: number; d_ok: number; d_sum: number; d_sc: number; t_all: number; t_ok: number; t_sum: number; t_sc: number; matched: number; unmatched: number; topicsOff: Map<string, number>; first: string; last: string; noUid: boolean; eids: Set<string> };
  const per = new Map<string, P>();
  let dupEval = 0, noUid = 0;
  for (const r of R) {
    const uid = plain(r.uid);
    if (!uid) { noUid++; continue; }
    const p = per.get(uid) ?? { name: plain(r.name), d_all: 0, d_ok: 0, d_sum: 0, d_sc: 0, t_all: 0, t_ok: 0, t_sum: 0, t_sc: 0, matched: 0, unmatched: 0, topicsOff: new Map(), first: "", last: "", noUid: false, eids: new Set() };
    const eid = plain(r.eid);
    if (eid && p.eids.has(eid)) { dupEval++; continue; }
    p.eids.add(eid);
    const ok = plain(r.st) === "completed", s = plain(r.s) === "" ? null : Number(plain(r.s)), training = plain(r.ty) === "TRAINING_DEMO";
    if (training) { p.t_all++; if (ok) { p.t_ok++; if (s !== null) { p.t_sum += s; p.t_sc++; } } }
    else { p.d_all++; if (ok) { p.d_ok++; if (s !== null) { p.d_sum += s; p.d_sc++; } } }
    if (ok) {
      if (matchDemoTopic(idx, plain(r.t))) p.matched++;
      else { p.unmatched++; p.topicsOff.set(plain(r.t), (p.topicsOff.get(plain(r.t)) ?? 0) + 1); }
    }
    const d = plain(r.d);
    if (d && (!p.first || d < p.first)) p.first = d;
    if (d && (!p.last || d > p.last)) p.last = d;
    per.set(uid, p);
  }
  // what the Demos tab has stored, and what a sync would store now
  const stored = await db.select().from(instructorDemoCourseTable).catch(() => [] as (typeof instructorDemoCourseTable.$inferSelect)[]);
  const storedBy = new Map<string, number>(); for (const s of stored) storedBy.set(s.instructorUserId, (storedBy.get(s.instructorUserId) ?? 0) + s.demos);
  const subj = new Map(people.filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, (normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null) ?? null]));
  const live = await fetchDemoCourseRows(subj);
  const liveBy = new Map<string, number>(); for (const l of live) liveBy.set(l.instructor_user_id, (liveBy.get(l.instructor_user_id) ?? 0) + l.demos);

  const all = [...per.values()];
  const sum = (f: (p: P) => number) => all.reduce((a, p) => a + f(p), 0);
  console.log(`Rows read: ${R.length} (skipped: ${noUid} without instructor id, ${dupEval} duplicate evaluation ids)`);
  console.log(`Instructors: ${per.size} (with DEMO ${all.filter((p) => p.d_all).length}, with TRAINING_DEMO ${all.filter((p) => p.t_all).length})`);
  console.log(`DEMO: ${sum((p) => p.d_all)} in all, ${sum((p) => p.d_ok)} completed | TRAINING_DEMO: ${sum((p) => p.t_all)} in all, ${sum((p) => p.t_ok)} completed`);
  console.log(`Completed demos counted in the Demos tab (topic matches a lecture): ${sum((p) => p.matched)}; not counted (topic not in the lecture list): ${sum((p) => p.unmatched)}`);
  const byProd = new Map<string, { n: number; demos: number }>();
  for (const [uid, p] of per) { const k = crm.get(uid) ? productOf(crm.get(uid)!) : "NOT IN CRM"; const e = byProd.get(k) ?? { n: 0, demos: 0 }; e.n++; e.demos += p.d_ok + p.t_ok; byProd.set(k, e); }
  console.log(`By CRM product (instructors / completed demos): ${[...byProd].sort((a, b) => b[1].demos - a[1].demos).map(([k, v]) => `${k} ${v.n}/${v.demos}`).join(", ")}`);
  // Note: a demo whose topic is in several courses is counted once per course in the tab's cells; liveBy can therefore be a little higher.
  let diffStored = 0, diffLive = 0;
  for (const [uid, p] of per) { if ((storedBy.get(uid) ?? 0) !== (liveBy.get(uid) ?? 0)) diffStored++; if ((liveBy.get(uid) ?? 0) < p.matched) diffLive++; }
  console.log(`\nDemos tab check: stored data synced ${stored[0] ? new Date(stored[0].syncedAt).toISOString() : "never"}; instructors whose stored count differs from a fresh sync: ${diffStored} (run Sync Now if > 0);`);
  console.log(`instructors where the tab would count fewer matched demos than here: ${diffLive} (should be 0)`);
  const top = [...per].sort((a, b) => (b[1].d_ok + b[1].t_ok) - (a[1].d_ok + a[1].t_ok)).slice(0, 15);
  console.log(`\nTop 15 by completed demos (employee ID | product | demos completed / all | training demos completed / all | avg score | counted in tab):`);
  for (const [uid, p] of top) { const c = crm.get(uid); console.log(`  ${c?.employeeId || "-"} | ${c ? productOf(c) : "NOT IN CRM"} | ${p.d_ok}/${p.d_all} | ${p.t_ok}/${p.t_all} | ${p.d_sc ? (p.d_sum / p.d_sc).toFixed(2) : "-"} | ${p.matched}`); }

  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const out = [["Name", "Employee ID", "CRM product", "Subject", "Demos (all)", "Demos completed", "Demo avg score", "Training demos (all)", "Training demos completed", "Training demo avg score",
    "Total completed", "Counted in Demos tab", "Not counted", "Topics not counted", "First demo", "Last demo", "Stored in tab now", "After next sync"].map(esc).join(",")];
  for (const [uid, p] of [...per].sort((a, b) => (b[1].d_ok + b[1].t_ok) - (a[1].d_ok + a[1].t_ok))) {
    const c = crm.get(uid);
    out.push([c?.fullName || p.name, c?.employeeId || "", c ? productOf(c) : "NOT IN CRM", c?.deptArea || c?.manualDeptArea || "", p.d_all, p.d_ok, p.d_sc ? (p.d_sum / p.d_sc).toFixed(2) : "",
      p.t_all, p.t_ok, p.t_sc ? (p.t_sum / p.t_sc).toFixed(2) : "", p.d_ok + p.t_ok, p.matched, p.unmatched,
      [...p.topicsOff].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`).join("; "), p.first, p.last, storedBy.get(uid) ?? 0, liveBy.get(uid) ?? 0].map(esc).join(","));
  }
  fs.writeFileSync("demo_counts_audit.csv", out.join("\n"));
  console.log(`\nPer instructor, with names: demo_counts_audit.csv (${per.size} rows -- delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
