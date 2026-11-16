// One-off, READ-ONLY (2026-11-16, per request: check whether FCC can read the efficacy workspace demo tables before building the
// Instructor Readiness dashboard). For each table in kossip-helpers.niat_instructor_efficacy_ai_analytics_workspace:
//   readable? row count, instructors, date range, columns (and, for short-valued columns, the top values -- names / emails / urls hidden)
// Then one check for one instructor (default NW2000396): her classes in niat_sessions_wise_summary_details with demo_taken_status /
// demo_qa_rating, next to her DEMO / AI_ASSESSMENT rows for the same title. Employee IDs, titles and counts only.
//   pnpm exec tsx src/lib/connectors/_tmp_efficacy_access.ts [NW2000396]
import { BigQuery } from "@google-cloud/bigquery";
import { eq } from "drizzle-orm";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";

const DS = "niat_instructor_efficacy_ai_analytics_workspace";
const TABLES = ["niat_session_wise_qa_rating", "niat_sessions_wise_summary_details", "niat_session_wise_agent_rating", "niat_session_wise_sub_rubric_details"];
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const hide = /name|mail|phone|mobile|url|link|remark|comment|feedback|transcript|text/i;

async function main() {
  const emp = (process.argv.slice(2).filter((a) => a !== "--")[0] ?? "NW2000396").trim().toUpperCase();
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const ok: Record<string, string[]> = {};
  // 2026-11-16: the data team may expose the tables as views in a dataset FCC already reads instead of granting the workspace --
  // so each table is tried in the efficacy workspace first, then in niat_instructor_automation_data and niat_reverse_etl_bases.
  const where: Record<string, string> = {};
  for (const t of TABLES) {
    let found = "";
    for (const ds of [DS, config.BIGQUERY_DATASET!, "niat_reverse_etl_bases"]) {
      if (t === "niat_session_wise_qa_rating" && ds !== DS) continue;
      try { await bq.query({ query: `SELECT 1 FROM \`${P}.${ds}.${t}\` LIMIT 1` }); found = ds; break; }
      catch (e) { console.log(`  ${ds}.${t}: ${/not found/i.test((e as Error).message) ? "does not exist" : "no access"}`); }
    }
    if (!found) { console.log(`  => ${t}: NOT READABLE anywhere yet`); continue; }
    where[t] = found;
    const T = `\`${P}.${found}.${t}\``;
    console.log(`\n================ ${found}.${t}`);
    let cols: string[];
    const [r1] = await bq.query({ query: `SELECT * FROM ${T} LIMIT 1` });
    cols = Object.keys((r1 as Record<string, unknown>[])[0] ?? {});
    ok[t] = cols;
    const user = cols.find((c) => /^instructor_user_id$/i.test(c));
    const date = cols.find((c) => /^session_date$/i.test(c)) ?? cols.find((c) => /session_start_datetime|created|date/i.test(c));
    const [s] = await bq.query({ query: `SELECT COUNT(*) AS n${user ? `, COUNT(DISTINCT ${user}) AS people` : ""}${date ? `, MIN(CAST(${date} AS STRING)) AS lo, MAX(CAST(${date} AS STRING)) AS hi` : ""} FROM ${T}` });
    const x = (s as Record<string, unknown>[])[0];
    console.log(`  READABLE | rows ${plain(x.n)}${user ? ` | instructors ${plain(x.people)}` : ""}${date ? ` | ${date} ${plain(x.lo).slice(0, 10)} .. ${plain(x.hi).slice(0, 10)}` : ""}`);
    console.log(`  columns (${cols.length}): ${cols.join(", ")}`);
    for (const c of cols) {
      if (hide.test(c) || /(^|_)id$/i.test(c)) continue;
      const [d] = await bq.query({ query: `SELECT COUNT(DISTINCT CAST(\`${c}\` AS STRING)) AS d FROM ${T}` });
      const n = Number(plain((d as Record<string, unknown>[])[0].d));
      if (n > 15) continue;
      const [top] = await bq.query({ query: `SELECT CAST(\`${c}\` AS STRING) AS v, COUNT(*) AS n FROM ${T} GROUP BY v ORDER BY n DESC LIMIT 8` });
      console.log(`    ${c}: ${(top as Record<string, unknown>[]).map((t) => `${plain(t.v).slice(0, 40) || "(blank)"} [${plain(t.n)}]`).join(" | ")}`);
    }
  }

  // One instructor: classes with prep status vs her actual demos / AI assessments for the same title.
  const [p] = await db.select().from(instructorsTable).where(eq(instructorsTable.employeeId, emp));
  if (!p?.teachosUserId || !ok["niat_sessions_wise_summary_details"]) { console.log(`\n(${emp}: skipped -- no TeachOS id or summary table not readable)`); process.exit(0); }
  const sc = ok["niat_sessions_wise_summary_details"];
  const title = sc.find((c) => /^session_title$/i.test(c)) ?? sc.find((c) => /title/i.test(c));
  const start = sc.find((c) => /session_start_datetime/i.test(c)) ?? sc.find((c) => /date/i.test(c));
  if (!title || !start || !sc.includes("demo_taken_status")) { console.log("\n(summary table has no title / date / demo_taken_status column -- skipped the per-class check)"); process.exit(0); }
  const [cls] = await bq.query({ query: `SELECT CAST(${start} AS STRING) AS d, ${title} AS t, demo_taken_status AS st${sc.includes("demo_qa_rating") ? ", demo_qa_rating AS r" : ""}
    FROM \`${P}.${where["niat_sessions_wise_summary_details"]}.niat_sessions_wise_summary_details\` WHERE instructor_user_id = @u ORDER BY ${start} DESC LIMIT 15`, params: { u: p.teachosUserId } });
  const qaT = ok["niat_session_wise_qa_rating"] ? `${P}.${DS}.niat_session_wise_qa_rating` : `${P}.${config.BIGQUERY_DATASET}.niat_session_wise_qa_rating`;
  const [ev] = await bq.query({ query: `SELECT session_title AS t, evaluation_type AS ty, CAST(session_date AS STRING) AS d, final_score AS s, SAFE_CAST(audio_duration AS FLOAT64) / 60 AS m
    FROM \`${qaT}\` WHERE instructor_user_id = @u AND evaluation_type IN ('DEMO','AI_ASSESSMENT','TRAINING_DEMO','TRAINING_AI_ASSESSMENT') AND UPPER(status) = 'COMPLETED'`, params: { u: p.teachosUserId } });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  console.log(`\n================ ${emp}: her last 15 classes (summary table) vs her demos / AI assessments for the same title`);
  const total = cls as Record<string, unknown>[];
  for (const c of total) {
    const d = plain(c.d).slice(0, 10);
    const same = (ev as Record<string, unknown>[]).filter((e) => norm(plain(e.t)) === norm(plain(c.t)) && plain(e.d).slice(0, 10) <= d);
    console.log(`  ${d} | ${plain(c.t)} | demo_taken_status ${plain(c.st) || "NULL"}${"r" in c ? ` | demo_qa_rating ${plain(c.r) || "-"}` : ""}`);
    for (const e of same) console.log(`      -> ${plain(e.ty)} ${plain(e.d).slice(0, 10)} ${Math.round(Number(plain(e.m)) * 10) / 10} min, score ${plain(e.s)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
