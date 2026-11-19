// One-off, READ-ONLY (2026-11-19, per request: "what about the topin assessments of aptitude"). Aptitude exams all fall into one
// "Aptitude exams" bucket (topinAssessments.ts, aptitude_general), which has no semester, so the semester readiness / fit checks see no
// Aptitude Top-N. This lists every topin exam title that looks like Aptitude -- by the current rule (aptitude / apti / quantitative /
// reasoning) or by an aptitude TOPIC word (percentages, ratio, time and work, syllogism, ...) -- with Daily/Weekly, how many instructors
// took it and when, so the titles can be mapped to Quantitative Aptitude (Sem 1) / Numerical Ability (Sem 2) / Logical Reasoning (Sem 3).
// Titles and counts only; no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_aptitude.ts
import { BigQuery } from "@google-cloud/bigquery";
import { config } from "./config";
import { courseOfExam } from "./topinAssessments";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const RULE = /aptitude|(^|[^a-z])apti|apty|quantitative|reasoning/i;
const TOPIC = /percent|ratio|proportion|average|profit|loss|interest|time and work|time & work|work and time|pipes|cistern|speed|distance|train|boat|stream|mixture|alligation|number system|hcf|lcm|divisib|remainder|power cycle|unit digit|permutation|combination|clock|calendar|age|partnership|syllogism|blood relation|coding|decoding|seating|arrangement|direction|series|analogy|puzzle|data interpretation|data sufficiency|venn|cube|dice|inequalit|quant|numerical|logical|verbal/i;

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const table = process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details";
  const T = `\`${P}.${config.BIGQUERY_DATASET}.${table}\``;
  const [rows] = await bq.query({ query: `SELECT assessment_title AS t, ANY_VALUE(exam_type) AS ty, COUNT(DISTINCT instructor_user_id) AS people,
      MIN(exam_attempt_start_date) AS lo, MAX(exam_attempt_start_date) AS hi FROM ${T} GROUP BY t` });
  const all = (rows as Record<string, unknown>[]).map((r) => ({ t: plain(r.t).trim(), ty: plain(r.ty) || "-", people: Number(plain(r.people)), lo: plain(r.lo).slice(0, 10), hi: plain(r.hi).slice(0, 10) }));
  const show = (list: typeof all) => { for (const r of list.sort((a, b) => a.t.localeCompare(b.t))) console.log(`  ${r.t} | ${r.ty} | ${r.people} instructors | ${r.lo} .. ${r.hi} | now counted as: ${courseOfExam(r.t)?.title ?? "(not counted)"}`); };
  const byRule = all.filter((r) => RULE.test(r.t));
  const byTopic = all.filter((r) => !RULE.test(r.t) && TOPIC.test(r.t));
  console.log(`All topin exam titles: ${all.length}`);
  console.log(`\n1. Matched by the current Aptitude rule (${byRule.length} titles, ${byRule.reduce((a, r) => a + r.people, 0)} instructor-exams):`);
  show(byRule);
  console.log(`\n2. Not matched, but the title has an aptitude topic word (${byTopic.length} titles) -- check which are really Aptitude:`);
  show(byTopic);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
