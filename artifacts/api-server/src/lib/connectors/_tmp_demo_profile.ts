// One-off, READ-ONLY (2026-10-28, per request: "go through the demo data -- what is stored, who is in it, and how it differs from the
// training data"). On niat_session_wise_qa_rating:
//   A) per evaluation type, side by side: rows, people, topics, status (case-folded), score spread, recording length, and how filled
//      every column is -- this shows which columns / rows differ between DEMO, TRAINING_DEMO, MOCK, SCHEDULE, AI types, CONNECT
//   B) DEMO in detail: per month, demos per instructor, the people (CRM product, category, role, institute type, active or not),
//      sample values of the ID-type columns, top topics; and the same for TRAINING_DEMO for comparison
// Console has no staff names. Per-instructor DEMO list WITH names: demo_people.csv (delete after download).
//   pnpm exec tsx src/lib/connectors/_tmp_demo_profile.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
async function main() {
  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ds = `${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}`;
  const V = `\`${ds}.niat_session_wise_qa_rating\``;
  const [cr] = await bq.query({ query: `SELECT column_name FROM \`${ds}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = 'niat_session_wise_qa_rating' ORDER BY ordinal_position` });
  const cols = (cr as { column_name: string }[]).map((c) => c.column_name);

  // A) side by side per type
  const fill = cols.map((c) => `ROUND(100 * COUNTIF(${c} IS NOT NULL AND TRIM(CAST(${c} AS STRING)) != '') / COUNT(*)) AS \`f_${c}\``).join(", ");
  const [a] = await bq.query({ query: `SELECT evaluation_type AS ty, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS ppl, COUNT(DISTINCT session_title) AS topics,
      COUNTIF(LOWER(status) = 'completed') AS ok, COUNTIF(LOWER(status) = 'failed') AS failed,
      ROUND(AVG(IF(LOWER(status) = 'completed', final_score, NULL)), 2) AS avg, APPROX_QUANTILES(IF(LOWER(status) = 'completed', final_score, NULL), 4) AS q,
      ROUND(AVG(SAFE_CAST(audio_duration AS FLOAT64)) / 60, 1) AS mins, CAST(MIN(session_date) AS STRING) AS f, CAST(MAX(session_date) AS STRING) AS l, ${fill}
    FROM ${V} GROUP BY 1 ORDER BY 2 DESC` });
  const A = a as Record<string, unknown>[];
  console.log("A) Per evaluation type: rows | people | topics | completed | failed | avg score | score quartiles (min/25%/median/75%/max) | avg recording mins | dates");
  for (const r of A) console.log(`  ${plain(r.ty)}: ${plain(r.n)} | ${plain(r.ppl)} | ${plain(r.topics)} | ${plain(r.ok)} | ${plain(r.failed)} | ${plain(r.avg)} | ${((r.q as unknown[]) ?? []).map(plain).join("/")} | ${plain(r.mins)} | ${plain(r.f)}..${plain(r.l)}`);
  console.log("\n  % of rows with a value, per column (" + A.map((r) => plain(r.ty)).join(" / ") + "):");
  for (const c of cols) console.log(`   ${c.padEnd(30)} ${A.map((r) => String(plain(r[`f_${c}`])).padStart(4)).join(" ")}`);

  // B) DEMO and TRAINING_DEMO in detail
  const crm = new Map((await db.select().from(instructorsTable)).filter((p) => p.teachosUserId).map((p) => [p.teachosUserId!, p]));
  const [det] = await bq.query({ query: `SELECT instructor_user_id AS uid, instructor_category AS cat, instructor_role AS role, instructor_status AS st, institute_type AS it, nw_instructor_id AS emp, instructor_name AS n FROM \`${ds}.niat_instructor_details\`` });
  const D = new Map((det as Record<string, unknown>[]).map((r) => [plain(r.uid), r]));
  for (const ty of ["DEMO", "TRAINING_DEMO"]) {
    console.log(`\nB) ${ty}`);
    const [m] = await bq.query({ query: `SELECT FORMAT_DATE('%Y-%m', session_date) AS mo, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS p, ROUND(AVG(IF(LOWER(status) = 'completed', final_score, NULL)), 2) AS avg
      FROM ${V} WHERE evaluation_type = @ty GROUP BY 1 ORDER BY 1`, params: { ty } });
    console.log(`  per month (demos / instructors / avg score): ${(m as Record<string, unknown>[]).map((r) => `${plain(r.mo)} ${plain(r.n)}/${plain(r.p)}/${plain(r.avg)}`).join(", ")}`);
    const [pp] = await bq.query({ query: `SELECT instructor_user_id AS uid, ANY_VALUE(instructor_name) AS n, COUNT(*) AS n_all, COUNTIF(LOWER(status) = 'completed') AS ok,
        ROUND(AVG(IF(LOWER(status) = 'completed', final_score, NULL)), 2) AS avg, COUNT(DISTINCT session_title) AS topics,
        CAST(MIN(session_date) AS STRING) AS f, CAST(MAX(session_date) AS STRING) AS l, ANY_VALUE(institute_name) AS inst, ANY_VALUE(instructor_manager_name) AS mgr
      FROM ${V} WHERE evaluation_type = @ty GROUP BY 1`, params: { ty } });
    const P = pp as Record<string, unknown>[];
    const per = P.map((r) => Number(plain(r.n_all))).sort((x, y) => x - y);
    console.log(`  instructors ${P.length}; demos per instructor: min ${per[0]}, median ${per[Math.floor(per.length / 2)]}, 90th pct ${per[Math.floor(per.length * 0.9)]}, max ${per[per.length - 1]}`);
    const tally = (f: (r: Record<string, unknown>) => string) => { const t = new Map<string, number>(); for (const r of P) t.set(f(r) || "(blank)", (t.get(f(r) || "(blank)") ?? 0) + 1); return [...t].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", "); };
    console.log(`  CRM product: ${tally((r) => { const p = crm.get(plain(r.uid)); return p ? productOf(p) : "NOT IN CRM"; })}`);
    console.log(`  in the CRM, still active in TeachOS: ${P.filter((r) => crm.get(plain(r.uid))?.inTeachos).length}, in Darwin: ${P.filter((r) => crm.get(plain(r.uid))?.inDarwin).length}`);
    console.log(`  category: ${tally((r) => plain(D.get(plain(r.uid))?.cat))}`);
    console.log(`  role: ${tally((r) => plain(D.get(plain(r.uid))?.role))} | status: ${tally((r) => plain(D.get(plain(r.uid))?.st))} | institute type: ${tally((r) => plain(D.get(plain(r.uid))?.it))}`);
    const [sv] = await bq.query({ query: `SELECT ANY_VALUE(session_id) AS session_id, ANY_VALUE(session_section_id) AS session_section_id, ANY_VALUE(category_id) AS category_id,
        ANY_VALUE(evaluation_id) AS evaluation_id, COUNT(DISTINCT category_id) AS n_cat, COUNT(DISTINCT session_id) AS n_sid, COUNT(DISTINCT evaluation_id) AS n_eval, COUNT(*) AS n
      FROM ${V} WHERE evaluation_type = @ty`, params: { ty } });
    const S = (sv as Record<string, unknown>[])[0];
    console.log(`  ID columns: session_id e.g. ${plain(S.session_id)} (${plain(S.n_sid)} distinct) | session_section_id e.g. ${plain(S.session_section_id) || "-"} | category_id e.g. ${plain(S.category_id)} (${plain(S.n_cat)} distinct) | evaluation_id ${plain(S.n_eval)} distinct of ${plain(S.n)} rows`);
    const [tp] = await bq.query({ query: `SELECT session_title AS t, COUNT(*) AS n FROM ${V} WHERE evaluation_type = @ty GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, params: { ty } });
    console.log(`  top topics: ${(tp as Record<string, unknown>[]).map((r) => `${plain(r.t)} ${plain(r.n)}`).join(", ")}`);
    if (ty === "DEMO") {
      const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
      const out = [["Name", "Employee ID", "CRM product", "Category", "Role", "Status", "Institute type", "Institute", "Manager", "Demos", "Completed", "Avg score", "Topics", "First demo", "Last demo"].map(esc).join(",")];
      for (const r of P.sort((x, y) => Number(plain(y.n_all)) - Number(plain(x.n_all)))) {
        const p = crm.get(plain(r.uid)); const d = D.get(plain(r.uid));
        out.push([p?.fullName || plain(r.n), p?.employeeId || plain(d?.emp), p ? productOf(p) : "NOT IN CRM", plain(d?.cat), plain(d?.role), plain(d?.st), plain(d?.it), plain(r.inst), plain(r.mgr),
          plain(r.n_all), plain(r.ok), plain(r.avg), plain(r.topics), plain(r.f), plain(r.l)].map(esc).join(","));
      }
      fs.writeFileSync("demo_people.csv", out.join("\n"));
      console.log(`  per-instructor list with names: demo_people.csv (delete after download)`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
