// One-off, READ-ONLY (2026-11-12, per request: Frontend readiness vs the topin assessment data). The assessment view has no course
// column, so this finds how Frontend exams can be matched to the five Frontend courses:
//   A. unit_id overlap with each course's lecture unit IDs (lectureSessions.ts)
//   B. Frontend-looking words in assessment_title / exam_title / section_title, with row counts and distinct instructors
//   C. the 40 most common assessment titles overall, to see the naming pattern
// Titles and counts only; no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_frontend_map.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { LECTURE_COURSES } from "../../data/lectureSessions";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const FE = [{ name: "HTML & CSS", key: "static_web" }, { name: "Modern Responsive UI", key: "modern_responsive_ui" }, { name: "JavaScript Essentials", key: "javascript_essentials" }, { name: "Dynamic Web App", key: "dynamic_web_app" }, { name: "React JS", key: "react_js" }];
const WORDS = ["html", "css", "responsive", "bootstrap", "flex", "javascript", "java script", "js", "dom", "dynamic", "react", "frontend", "front end", "web"];

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const T = `\`${P}.niat_instructor_automation_data.z_niat_tech_instrctor_trainee_exam_best_scores_details\``;
  const [units] = await bq.query({ query: `SELECT LOWER(REPLACE(unit_id, '-', '')) AS u, ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people FROM ${T} GROUP BY u` });
  const byUnit = new Map((units as Record<string, unknown>[]).map((r) => [plain(r.u), r]));
  console.log("A. unit_id overlap with each Frontend course's lecture unit IDs");
  for (const c of FE) {
    const ids = new Set((LECTURE_COURSES.find((x) => x.key === c.key)?.lectures ?? []).flatMap((l) => l.unitIds.map((u) => u.toLowerCase().replace(/-/g, ""))));
    const hits = [...ids].map((u) => byUnit.get(u)).filter(Boolean) as Record<string, unknown>[];
    console.log(`  ${c.name}: ${ids.size} lecture unit IDs, ${hits.length} found in the exams${hits.length ? " -> " + hits.slice(0, 5).map((h) => `${plain(h.t)} (${plain(h.ty)}, ${plain(h.people)} people)`).join(" | ") : ""}`);
  }
  console.log("\nB. Frontend-looking words in titles (word: rows / distinct instructors; top titles)");
  for (const w of WORDS) {
    const re = w === "js" || w === "dom" || w === "web" ? `r'(?i)(^|[^a-z])${w}([^a-z]|$)'` : `r'(?i)${w}'`;
    const cond = `(REGEXP_CONTAINS(assessment_title, ${re}) OR REGEXP_CONTAINS(IFNULL(exam_title, ''), ${re}) OR REGEXP_CONTAINS(section_title, ${re}))`;
    const [s] = await bq.query({ query: `SELECT COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people FROM ${T} WHERE ${cond}` });
    const x = (s as Record<string, unknown>[])[0];
    if (!Number(plain(x.n))) { console.log(`  ${w}: none`); continue; }
    const [top] = await bq.query({ query: `SELECT assessment_title AS t, exam_type AS ty, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people FROM ${T} WHERE ${cond} GROUP BY t, ty ORDER BY n DESC LIMIT 12` });
    console.log(`  ${w}: ${plain(x.n)} rows / ${plain(x.people)} instructors\n     ${(top as Record<string, unknown>[]).map((t) => `${plain(t.t).slice(0, 70)} [${plain(t.ty)}, ${plain(t.people)}]`).join("\n     ")}`);
  }
  console.log("\nC. 40 most common assessment titles (rows / instructors)");
  const [top] = await bq.query({ query: `SELECT assessment_title AS t, exam_type AS ty, COUNT(*) AS n, COUNT(DISTINCT instructor_user_id) AS people, MIN(exam_attempt_start_date) AS lo, MAX(exam_attempt_start_date) AS hi FROM ${T} GROUP BY t, ty ORDER BY n DESC LIMIT 40` });
  for (const t of top as Record<string, unknown>[]) console.log(`  ${plain(t.t).slice(0, 80)} [${plain(t.ty)}] ${plain(t.n)} rows / ${plain(t.people)} people | ${plain(t.lo)} .. ${plain(t.hi)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
