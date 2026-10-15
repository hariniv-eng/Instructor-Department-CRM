// One-off, READ-ONLY (2026-10-15): checks the Avg Demo / AI Score on the Contribution tab for ONE instructor against the raw evaluation rows
// in z_niat_instructors_demo_qa_rating_details. Prints every evaluation row of that person in the date range (all statuses), then works the
// average out step by step the way the Contribution tab does, plus a few alternative ways, so a difference is easy to spot.
// Run in the Replit shell from artifacts/api-server (employee id OR part of the name; dates optional, default = last 7 days):
//   pnpm exec tsx src/lib/connectors/_tmp_score_check.ts NW0001234
//   pnpm exec tsx src/lib/connectors/_tmp_score_check.ts "Karthik" --from=2026-10-09 --to=2026-10-15
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable, instructorEvaluationDailyTable } from "@workspace/db";
import { config } from "./config";

const val = (v: unknown) => (v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const args = process.argv.slice(2);
  const who = args.find((a) => !a.startsWith("--"));
  if (!who) { console.log("Give an employee id or part of a name, e.g. NW0001234"); process.exit(1); }
  const today = new Date();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  const from = args.find((a) => a.startsWith("--from="))?.slice(7) ?? iso(weekAgo);
  const to = args.find((a) => a.startsWith("--to="))?.slice(5) ?? iso(today);

  const people = await db.select({ name: instructorsTable.fullName, employeeId: instructorsTable.employeeId, teachosUserId: instructorsTable.teachosUserId }).from(instructorsTable);
  const hits = people.filter((p) => p.teachosUserId && (p.employeeId?.toLowerCase() === who.toLowerCase() || p.name.toLowerCase().includes(who.toLowerCase())));
  if (hits.length !== 1) { console.log(`Matched ${hits.length} people with a TeachOS id for "${who}":`, hits.map((h) => `${h.name} (${h.employeeId})`).join("; ")); process.exit(1); }
  const person = hits[0];
  console.log(`Instructor: ${person.name} (${person.employeeId}), TeachOS id ${person.teachosUserId}, range ${from} to ${to}\n`);

  const project = config.BIGQUERY_PROJECT_ID;
  const ds = config.BIGQUERY_DATASET;
  const bq = config.BIGQUERY_CREDENTIALS_JSON ? new BigQuery({ projectId: project, credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) }) : new BigQuery({ projectId: project });
  const ref = `\`${project}.${ds}.z_niat_instructors_demo_qa_rating_details\``;
  const [rows] = await bq.query({ query: `SELECT * FROM ${ref} WHERE instructor_user_id = @id AND session_date BETWEEN @from AND @to ORDER BY session_date, evaluation_type, session_id`, params: { id: person.teachosUserId, from, to } });
  console.log(`=== 1. Raw rows in the view (${rows.length}), every status ===`);
  console.log("columns:", rows[0] ? Object.keys(rows[0]).join(", ") : "(none)");
  rows.forEach((r: Record<string, unknown>, i: number) => console.log(`  ${i + 1}. date=${val(r.session_date)} | type=${r.evaluation_type} | status=${r.status} | session_id=${r.session_id} | audio_sec=${r.audio_duration} | final_score=${r.final_score}`));

  console.log("\n=== 2. What the Contribution tab counts ===");
  type Ev = { date: string; type: string; session: string; secs: number; score: number | null };
  const best = new Map<string, Ev>();
  for (const r of rows as Array<Record<string, unknown>>) {
    if (String(r.status ?? "").toUpperCase() !== "COMPLETED") continue;
    const key = `${val(r.session_date)}|${r.evaluation_type}|${r.session_id}`;
    const secs = Number(r.audio_duration);
    const sc = r.final_score === null || r.final_score === undefined || r.final_score === "" ? null : Number(r.final_score);
    const cur = best.get(key) ?? { date: String(val(r.session_date)), type: String(r.evaluation_type), session: String(r.session_id), secs: -Infinity, score: null };
    if (!Number.isNaN(secs) && secs > cur.secs) cur.secs = secs;
    if (sc !== null && !Number.isNaN(sc) && (cur.score === null || sc > cur.score)) cur.score = sc;
    best.set(key, cur);
  }
  const evs = [...best.values()].filter((e) => e.type === "DEMO" || e.type === "AI_ASSESSMENT");
  evs.forEach((e) => console.log(`  ${e.date} ${e.type.padEnd(13)} session ${e.session}  audio ${e.secs === -Infinity ? "-" : Math.round(e.secs)}s  score ${e.score ?? "none"}`));
  const part = (t: string) => evs.filter((e) => e.type === t);
  const hours = (xs: Ev[]) => Math.round((xs.reduce((s, e) => s + (e.secs > 0 ? e.secs : 0), 0) / 3600) * 100) / 100;
  const scored = (xs: Ev[]) => xs.filter((e) => e.score !== null);
  const avg = (xs: Ev[]) => (scored(xs).length ? Math.round((scored(xs).reduce((s, e) => s + e.score!, 0) / scored(xs).length) * 100) / 100 : null);
  console.log(`\n  Demo: ${part("DEMO").length} evaluations, ${hours(part("DEMO"))} h, ${scored(part("DEMO")).length} scored, average ${avg(part("DEMO"))}`);
  console.log(`  AI assessment: ${part("AI_ASSESSMENT").length} evaluations, ${hours(part("AI_ASSESSMENT"))} h, ${scored(part("AI_ASSESSMENT")).length} scored, average ${avg(part("AI_ASSESSMENT"))}`);
  console.log(`  COMBINED (how the column is built: all scores added, divided by how many): ${avg(evs)}   from ${scored(evs).length} scored evaluations`);
  const dAvg = avg(part("DEMO")), aAvg = avg(part("AI_ASSESSMENT"));
  if (dAvg !== null && aAvg !== null) console.log(`  For comparison, plain average of the two averages: ${Math.round(((dAvg + aAvg) / 2) * 100) / 100}`);

  console.log("\n=== 3. What is stored in instructor_evaluation_daily for this person and range ===");
  const stored = (await db.select().from(instructorEvaluationDailyTable)).filter((s) => s.instructorUserId === person.teachosUserId && String(s.sessionDate) >= from && String(s.sessionDate) <= to);
  stored.forEach((s) => console.log(`  ${s.sessionDate} ${s.evaluationType.padEnd(13)} evaluations ${s.evaluations}  seconds ${s.seconds}  score_sum ${s.scoreSum}  scored ${s.scored}`));
  const sumScore = stored.reduce((a, s) => a + s.scoreSum, 0), sumScored = stored.reduce((a, s) => a + s.scored, 0);
  console.log(`  -> stored combined average = ${sumScored ? Math.round((sumScore / sumScored) * 100) / 100 : "none"} (score_sum ${sumScore} / scored ${sumScored})`);
  process.exit(0);
}
main().catch((e) => { console.error("FAILED:", (e as Error).message); process.exit(1); });
