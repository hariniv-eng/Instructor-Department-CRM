// One-off, READ-ONLY (2026-10-28, per request: "what exactly do TRAINING_DEMO / TRAINING_AI_ASSESSMENT mean?"). Compares the training
// types with the normal DEMO / AI_ASSESSMENT in niat_session_wise_qa_rating, to see who does them and on what:
//   - institute type / category / role of the rows, and the CRM product of the people (NIAT Deployed vs NIAT Training etc.)
//   - their joining dates (new joiners?), and whether the same people also have normal demos / AI assessments
//   - which topics and which learning-portal courses the topic IDs belong to
// No staff names. Writes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_training_eval_check.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const TYPES = ["TRAINING_DEMO", "TRAINING_AI_ASSESSMENT", "DEMO", "AI_ASSESSMENT"];
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const V = `\`${ds}.niat_session_wise_qa_rating\``, P = `\`${ds}.niat_instructor_unit_wise_completion_and_best_attempt_details\``;
  const [rows] = await bq.query({ query: `SELECT evaluation_type AS ty, instructor_user_id AS uid, institute_type AS it, instructor_category AS cat, instructor_role AS role,
      session_title AS t, REPLACE(LOWER(session_id), '-', '') AS sid, CAST(session_date AS STRING) AS d FROM ${V} WHERE evaluation_type IN UNNEST(@ty)`, params: { ty: TYPES } });
  const R = rows as Record<string, unknown>[];
  const crm = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const tally = (list: Record<string, unknown>[], f: (r: Record<string, unknown>) => string) => {
    const m = new Map<string, number>(); for (const r of list) m.set(f(r) || "(blank)", (m.get(f(r) || "(blank)") ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([a, b]) => `${a} ${b}`).join(", ");
  };
  const people = (ty: string) => [...new Set(R.filter((r) => plain(r.ty) === ty).map((r) => plain(r.uid)))];
  for (const ty of TYPES) {
    const list = R.filter((r) => plain(r.ty) === ty);
    const ppl = people(ty);
    const persons = ppl.map((u) => crm.get(u)).filter(Boolean) as (typeof instructorsTable.$inferSelect)[];
    const joins = persons.map((p) => String((p as Record<string, unknown>).dateOfJoining ?? "")).filter((d) => /^\d{4}/.test(d)).sort();
    console.log(`\n${ty}: ${list.length} rows, ${ppl.length} people, dates ${list.map((r) => plain(r.d)).sort()[0]} .. ${list.map((r) => plain(r.d)).sort().pop()}`);
    console.log(`  institute type: ${tally(list, (r) => plain(r.it))}`);
    console.log(`  category: ${tally(list, (r) => plain(r.cat))} | role: ${tally(list, (r) => plain(r.role))}`);
    console.log(`  people in the CRM: ${persons.length}/${ppl.length}; CRM product: ${tally(persons.map((p) => ({ p })) as Record<string, unknown>[], (x) => productOf((x as { p: typeof instructorsTable.$inferSelect }).p))}`);
    if (joins.length) console.log(`  joining dates (CRM): earliest ${joins[0]}, median ${joins[Math.floor(joins.length / 2)]}, latest ${joins[joins.length - 1]}`);
    console.log(`  top topics: ${tally(list, (r) => plain(r.t))}`);
  }
  for (const [tr, norm] of [["TRAINING_DEMO", "DEMO"], ["TRAINING_AI_ASSESSMENT", "AI_ASSESSMENT"]]) {
    const a = new Set(people(tr)), b = new Set(people(norm));
    console.log(`\n${tr} people who ALSO have ${norm}: ${[...a].filter((x) => b.has(x)).length} / ${a.size}`);
  }
  const [pc] = await bq.query({ query: `
    WITH t AS (SELECT evaluation_type AS ty, REPLACE(LOWER(session_id), '-', '') AS sid FROM ${V} WHERE evaluation_type IN UNNEST(@ty) AND session_id IS NOT NULL),
         u AS (SELECT DISTINCT REPLACE(LOWER(unit_id), '-', '') AS id, course_title AS c FROM ${P}
               UNION DISTINCT SELECT DISTINCT REPLACE(LOWER(CAST(topic_id AS STRING)), '-', ''), course_title FROM ${P})
    SELECT t.ty, IFNULL(u.c, '(topic ID not in the portal course data)') AS c, COUNT(*) AS n FROM t LEFT JOIN u ON u.id = t.sid GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
    params: { ty: TYPES } }).catch((e) => { console.log(`(course lookup failed: ${(e as Error).message})`); return [[]]; });
  console.log("\nLearning-portal course of the topic IDs (type | course | rows):");
  let last = ""; let shown = 0;
  for (const r of pc as Record<string, unknown>[]) { if (plain(r.ty) !== last) { last = plain(r.ty); shown = 0; } if (shown++ < 8) console.log(`  ${plain(r.ty)} | ${plain(r.c)} | ${plain(r.n)}`); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
