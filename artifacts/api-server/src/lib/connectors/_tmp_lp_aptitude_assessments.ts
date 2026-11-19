// One-off, READ-ONLY (2026-11-19, per request: "topin cannot be split into Aptitude courses -- for Aptitude only, use the LEARNING
// PORTAL assessments instead: each course has a list of assessments; count them and average the scores"). Finds what the learning
// portal has for the Aptitude courses (titles with aptitude / quantitative / numerical / logical / reasoning) in both learning-portal
// tables FCC can read:
//   (1) UNIT_COMPLETION_TABLE   -- unit-wise completion + best attempt
//   (2) PRACTICE_EXAM_TABLE     -- practice / exam / question-set attempts
// For each: its columns, then per Aptitude course x unit type: units, instructors, completed, and the average of every score-like
// column (score / percent / marks). Course titles, unit types and counts only -- no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_lp_aptitude_assessments.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { UNIT_COMPLETION_TABLE, PRACTICE_EXAM_TABLE } from "./instructorLearningStatus";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const APT = "r'(?i)aptitude|quantitative|numerical|logical|reasoning'";

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  for (const table of [UNIT_COMPLETION_TABLE, PRACTICE_EXAM_TABLE]) {
    console.log(`\n================ ${table}`);
    const [cols] = await bq.query({ query: `SELECT column_name, data_type FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t ORDER BY ordinal_position`, params: { t: table } });
    const list = (cols as Record<string, unknown>[]).map((c) => ({ n: plain(c.column_name), ty: plain(c.data_type) }));
    if (!list.length) { console.log("  (table not found / not readable)"); continue; }
    console.log(`Columns: ${list.map((c) => `${c.n} (${c.ty})`).join(", ")}`);
    const has = (re: RegExp) => list.find((c) => re.test(c.n))?.n;
    const course = has(/^course_title$/i) ?? has(/course.*(title|name)/i);
    const type = has(/^unit_type$/i) ?? has(/(unit|content|resource|exam|assessment).*type/i);
    const unit = has(/^unit_id$/i) ?? has(/(unit|exam|assessment|question_set).*id$/i);
    const unitTitle = has(/^unit_title$/i) ?? has(/(unit|exam|assessment|question_set).*(title|name)$/i);
    const user = has(/instructor_user_id|user_id/i);
    const scores = list.filter((c) => /score|percent|marks/i.test(c.n) && /INT|FLOAT|NUMERIC|BIGNUMERIC/i.test(c.ty)).map((c) => c.n);
    const status = has(/completion_status|status/i);
    console.log(`Using: course=${course ?? "-"} type=${type ?? "-"} unit=${unit ?? "-"} unit title=${unitTitle ?? "-"} user=${user ?? "-"} status=${status ?? "-"} scores=${scores.join(", ") || "-"}`);
    if (!course) { console.log("  no course column -- cannot pick Aptitude rows here"); continue; }
    const T = `\`${P}.${DS}.${table}\``;
    const agg = [
      unit ? `COUNT(DISTINCT CAST(${unit} AS STRING)) AS units` : "COUNT(*) AS units",
      user ? `COUNT(DISTINCT ${user}) AS people` : "0 AS people",
      `COUNT(*) AS row_count`,
      status ? `COUNTIF(UPPER(CAST(${status} AS STRING)) = 'COMPLETED') AS completed` : "0 AS completed",
      ...scores.map((s, i) => `ROUND(AVG(${s}), 3) AS s${i}, COUNTIF(${s} IS NOT NULL) AS n${i}, MAX(${s}) AS m${i}`),
    ].join(", ");
    const [rows] = await bq.query({ query: `SELECT ${course} AS ct, ${type ? `CAST(${type} AS STRING)` : "'-'"} AS ty, ${agg} FROM ${T} WHERE REGEXP_CONTAINS(${course}, ${APT}) GROUP BY ct, ty ORDER BY ct, ty` });
    console.log(`\nAptitude courses x unit type:`);
    for (const r of rows as Record<string, unknown>[]) console.log(`  ${plain(r.ct)} | ${plain(r.ty) || "(blank)"} | ${plain(r.units)} units | ${plain(r.people)} instructors | ${plain(r.row_count)} rows | completed ${plain(r.completed)}${scores.map((s, i) => ` | ${s}: avg ${plain(r[`s${i}`]) || "-"} (n ${plain(r[`n${i}`])}, max ${plain(r[`m${i}`]) || "-"})`).join("")}`);
    if (unitTitle) {
      const [titles] = await bq.query({ query: `SELECT ${course} AS ct, ${type ? `CAST(${type} AS STRING)` : "'-'"} AS ty, ${unitTitle} AS ut, ${user ? `COUNT(DISTINCT ${user})` : "COUNT(*)"} AS people FROM ${T}
          WHERE REGEXP_CONTAINS(${course}, ${APT}) ${type ? `AND REGEXP_CONTAINS(LOWER(CAST(${type} AS STRING)), r'exam|assess|quiz|test|question|practice|mcq')` : ""}
          GROUP BY ct, ty, ut ORDER BY ct, ty, ut LIMIT 400` });
      console.log(`\nAssessment-like units (type has exam / assess / quiz / test / question / practice / mcq), first 400:`);
      for (const r of titles as Record<string, unknown>[]) console.log(`  ${plain(r.ct)} | ${plain(r.ty)} | ${plain(r.ut)} | ${plain(r.people)} instructors`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
