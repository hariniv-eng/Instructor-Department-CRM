// One-off, READ-ONLY (2026-11-21, per request: "get me the DSA topin exams, I will tell you which should be Semester 2 or Semester 3").
// Lists every topin exam title that looks like DSA -- by the current rule (topinAssessments.ts: the word "DSA") or by a DSA TOPIC word
// (array, linked list, stack, queue, tree, graph, heap, hashing, sorting, searching, recursion, DP, binary search, two pointers, sliding
// window, greedy, backtracking, trie, bit manipulation, C++ ...) -- numbered, oldest first, with Daily/Weekly, how many instructors took
// it, how many of them have DSA as their subject, the dates, and what FCC counts it as today. Titles and counts only; no staff names.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_dsa.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { courseOfExam, normUid } from "./topinAssessments";
import { normalizeSubjectArea } from "../departmentTaxonomy";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const RULE = /(^|[^a-z])dsa([^a-z]|$)/i;
const TOPIC = /array|linked ?list|stack|queue|(^|[^a-z])trees?([^a-z]|$)|binary tree|\bbst\b|graph|heap|hash|sorting|searching|binary search|recursion|backtrack|dynamic programming|(^|[^a-z])dp([^a-z]|$)|two pointer|sliding window|greedy|\btrie\b|bit manipulation|bitwise|c\+\+|\bcpp\b|data structure|algorithm|time complexity|matrix traversal|prefix sum|leetcode|competitive programming|\bips\b|problem solving/i;

async function main() {
  const subjOf = new Map<string, string>();
  for (const p of await db.select().from(instructorsTable)) if (p.teachosUserId) subjOf.set(normUid(p.teachosUserId), normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "");
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const table = process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details";
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT assessment_title AS t, ANY_VALUE(exam_type) AS ty, ARRAY_AGG(DISTINCT instructor_user_id IGNORE NULLS) AS us,
      MIN(exam_attempt_start_date) AS lo, MAX(exam_attempt_start_date) AS hi FROM \`${P}.${DS}.${table}\` GROUP BY t` });
  const all = (rows as Record<string, unknown>[]).map((r) => {
    const us = ((r.us as unknown[]) ?? []).map((u) => normUid(plain(u)));
    return { t: plain(r.t).trim(), ty: plain(r.ty) || "-", people: us.length, dsaPeople: us.filter((u) => subjOf.get(u) === "DSA").length, lo: plain(r.lo).slice(0, 10), hi: plain(r.hi).slice(0, 10) };
  });
  const list = all.filter((r) => RULE.test(r.t) || TOPIC.test(r.t) || r.dsaPeople > 0).sort((a, b) => a.lo.localeCompare(b.lo) || a.t.localeCompare(b.t));
  console.log(`All topin exam titles: ${all.length} | DSA-like titles (rule, topic word, or taken by a DSA instructor): ${list.length}\n`);
  console.log("#|exam title|daily/weekly|instructors|of them DSA instructors|first date|last date|why listed|FCC counts it as now");
  list.forEach((r, i) => console.log([i + 1, r.t.replace(/\|/g, "/"), r.ty, r.people, r.dsaPeople, r.lo, r.hi, RULE.test(r.t) ? "DSA in title" : TOPIC.test(r.t) ? "DSA topic word" : "taken by DSA instructor", courseOfExam(r.t)?.title ?? "(not counted)"].join("|")));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
