// One-off, READ-ONLY (2026-10-28, per request: "go through the tables -- instructor details and the demo / AI-assessment view -- and get
// the data"). Profiles the two sources and checks them against what the CRM already has. No staff names printed. Writes nothing.
//   1) where each table lives (every dataset in the project), its columns and types
//   2) niat_instructor_details: rows, instructors, nw_instructor_id fill rate, category / role / status / institute-type breakdown,
//      and how many match the CRM (by TeachOS user id and by employee ID)
//   3) niat_session_wise_qa_rating: rows per evaluation_type x status, instructors, date range, score stats, fill rate of every column
//      (so we see which link fields are really there), instructors not in niat_instructor_details / not in the CRM, and the
//      demo <-> AI-assessment pairs (same instructor + same topic)
//   4) compared with the view the Contribution tab uses today (z_niat_instructors_demo_qa_rating_details)
//   pnpm exec tsx src/lib/connectors/_tmp_qa_profile.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const WANT = ["niat_instructor_details", "niat_session_wise_qa_rating", "z_niat_instructors_demo_qa_rating_details"];

async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const project = config.BIGQUERY_PROJECT_ID!;
  // 1) locate tables
  const where = new Map<string, string[]>();
  const [datasets] = await bq.getDatasets();
  for (const d of datasets) {
    try {
      const [t] = await bq.query({ query: `SELECT table_name, table_type FROM \`${project}.${d.id}.INFORMATION_SCHEMA.TABLES\` WHERE table_name IN UNNEST(@w)`, params: { w: WANT } });
      for (const r of t as { table_name: string; table_type: string }[]) where.set(r.table_name, [...(where.get(r.table_name) ?? []), `${d.id} (${r.table_type})`]);
    } catch { /* no access to that dataset */ }
  }
  console.log("1) Where the tables are:");
  for (const w of WANT) console.log(`   ${w}: ${where.get(w)?.join(", ") ?? "NOT FOUND in any dataset we can read"}`);
  const pick = (name: string) => { const list = where.get(name) ?? []; const own = list.find((x) => x.startsWith(`${config.BIGQUERY_DATASET} `)); return (own ?? list[0])?.split(" ")[0]; };
  const ref = (name: string) => `\`${project}.${pick(name)}.${name}\``;
  const colsOf = async (name: string) => {
    const [c] = await bq.query({ query: `SELECT column_name, data_type FROM \`${project}.${pick(name)}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: name } });
    return c as { column_name: string; data_type: string }[];
  };

  // 2) instructor details
  const crm = await db.select().from(instructorsTable);
  const crmUid = new Set(crm.map((r) => r.teachosUserId).filter(Boolean) as string[]);
  const crmEmp = new Set(crm.map((r) => (r.employeeId ?? "").toUpperCase()).filter(Boolean));
  if (pick("niat_instructor_details")) {
    const c = await colsOf("niat_instructor_details");
    console.log(`\n2) niat_instructor_details columns: ${c.map((x) => `${x.column_name} (${x.data_type})`).join(", ")}`);
    const [rows] = await bq.query({ query: `SELECT instructor_user_id AS uid, nw_instructor_id AS emp, instructor_category AS cat, instructor_role AS role,
      instructor_status AS st, institute_type AS it FROM ${ref("niat_instructor_details")}` });
    const R = rows as Record<string, unknown>[];
    const count = (k: string) => { const m = new Map<string, number>(); for (const r of R) m.set(plain(r[k]) || "(blank)", (m.get(plain(r[k]) || "(blank)") ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${b}`).join(", "); };
    console.log(`   rows ${R.length}, distinct instructor_user_id ${new Set(R.map((r) => plain(r.uid))).size}, nw_instructor_id filled ${R.filter((r) => plain(r.emp)).length}`);
    console.log(`   category: ${count("cat")}\n   role: ${count("role")}\n   status: ${count("st")}\n   institute type: ${count("it")}`);
    console.log(`   in the CRM: by TeachOS user id ${R.filter((r) => crmUid.has(plain(r.uid))).length} / ${R.length}; by employee ID ${R.filter((r) => crmEmp.has(plain(r.emp).toUpperCase())).length} / ${R.filter((r) => plain(r.emp)).length}`);
  }

  // 3) QA rating view
  for (const name of ["niat_session_wise_qa_rating", "z_niat_instructors_demo_qa_rating_details"]) {
    if (!pick(name)) continue;
    const c = await colsOf(name);
    const t = ref(name);
    console.log(`\n${name === WANT[1] ? "3)" : "4)"} ${name} columns: ${c.map((x) => `${x.column_name} (${x.data_type})`).join(", ")}`);
    const [tot] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins, CAST(MIN(session_date) AS STRING) AS f, CAST(MAX(session_date) AS STRING) AS l FROM ${t}` });
    const T = (tot as Record<string, unknown>[])[0];
    console.log(`   rows ${plain(T.n)}, instructors ${plain(T.ins)}, dates ${plain(T.f)} .. ${plain(T.l)}`);
    const [bt] = await bq.query({ query: `SELECT evaluation_type AS ty, status AS st, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ins,
        ROUND(AVG(SAFE_CAST(final_score AS FLOAT64)), 2) AS avg, CAST(MIN(session_date) AS STRING) AS f, CAST(MAX(session_date) AS STRING) AS l
      FROM ${t} GROUP BY 1, 2 ORDER BY 1, 3 DESC` });
    console.log("   type | status | rows | instructors | avg score | first .. last");
    for (const r of bt as Record<string, unknown>[]) console.log(`   ${plain(r.ty)} | ${plain(r.st)} | ${plain(r.n)} | ${plain(r.ins)} | ${plain(r.avg) || "-"} | ${plain(r.f)} .. ${plain(r.l)}`);
    // fill rate per column
    const fill = c.map((x) => `COUNTIF(${x.column_name} IS NOT NULL AND TRIM(CAST(${x.column_name} AS STRING)) != '') AS \`${x.column_name}\``).join(", ");
    const [fr] = await bq.query({ query: `SELECT ${fill} FROM ${t}` });
    const F = (fr as Record<string, unknown>[])[0];
    console.log(`   filled per column (of ${plain(T.n)}): ${c.map((x) => `${x.column_name} ${plain(F[x.column_name])}`).join(", ")}`);
    if (name !== WANT[1]) continue;
    const [u] = await bq.query({ query: `SELECT DISTINCT instructor_user_id AS uid FROM ${t}` });
    const uids = (u as Record<string, unknown>[]).map((r) => plain(r.uid));
    let notDetails = 0;
    if (pick("niat_instructor_details")) {
      const [d] = await bq.query({ query: `SELECT DISTINCT instructor_user_id AS uid FROM ${ref("niat_instructor_details")}` });
      const ds = new Set((d as Record<string, unknown>[]).map((r) => plain(r.uid)));
      notDetails = uids.filter((x) => !ds.has(x)).length;
    }
    console.log(`   instructors in this view: ${uids.length}; not in niat_instructor_details: ${notDetails}; not in the CRM: ${uids.filter((x) => !crmUid.has(x)).length}`);
    const [pairs] = await bq.query({ query: `
      WITH a AS (SELECT DISTINCT instructor_user_id, session_id FROM ${t} WHERE evaluation_type IN ('AI_ASSESSMENT', 'TRAINING_AI_ASSESSMENT')),
           d AS (SELECT DISTINCT instructor_user_id, session_id FROM ${t} WHERE evaluation_type IN ('DEMO', 'TRAINING_DEMO'))
      SELECT (SELECT COUNT(*) FROM a) AS ai, (SELECT COUNT(*) FROM a JOIN d USING (instructor_user_id, session_id)) AS paired` });
    const P = (pairs as Record<string, unknown>[])[0];
    console.log(`   AI assessments (instructor + topic): ${plain(P.ai)}, with a demo by the same instructor on the same topic: ${plain(P.paired)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
