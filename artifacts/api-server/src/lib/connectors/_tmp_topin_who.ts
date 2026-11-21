// One-off, READ-ONLY (2026-11-21, per request: "check again -- are there also STUDENTS' assessments in the topin table?"). For the topin
// trainee exam table (z_niat_tech_instrctor_trainee_exam_best_scores_details), who are the people behind the rows:
//   1. instructor_role values, with how many people and exam rows each
//   2. every person (instructor_user_id): in TeachOS's instructor list (niat_instructor_details)? in FCC (instructors table)? in the
//      FCC Instructor department? -- people in none of these could be students or outside candidates
//   3. the same split for the DSA exams that matter (titles with "DSA", "Sem 2/3", "Semester 2/3", "3rd sem") -- top 40 by takers
// Counts and roles only; no names.
//   pnpm exec tsx src/lib/connectors/_tmp_topin_who.ts
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { normUid } from "./topinAssessments";
import { departmentIdsOf } from "../../routes/reports";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const T = `\`${P}.${DS}.${process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details"}\``;
  const ID = `\`${P}.${DS}.${process.env.NIAT_INSTRUCTOR_DETAILS_TABLE || "niat_instructor_details"}\``;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const all = await db.select().from(instructorsTable);
  const dept = departmentIdsOf(all);
  const fcc = new Map(all.filter((p) => p.teachosUserId).map((p) => [normUid(p.teachosUserId!), dept.has(p.id)]));
  const [teachos] = await bq.query({ query: `SELECT DISTINCT instructor_user_id AS u FROM ${ID}` });
  const inTeachos = new Set((teachos as Record<string, unknown>[]).map((r) => normUid(plain(r.u))));
  const where = (u: string) => (fcc.get(u) === true ? "FCC Instructor department" : fcc.has(u) ? "in FCC, other team" : inTeachos.has(u) ? "TeachOS instructor list only" : "NOT in TeachOS instructor list (student / outsider?)");

  const [roles] = await bq.query({ query: `SELECT COALESCE(instructor_role, '(blank)') AS r, COUNT(DISTINCT instructor_user_id) AS people, COUNT(*) AS rows_n FROM ${T} GROUP BY 1 ORDER BY people DESC` });
  console.log("1. instructor_role in the topin table:");
  for (const r of roles as Record<string, unknown>[]) console.log(`   ${plain(r.r)}: ${plain(r.people)} people, ${plain(r.rows_n)} rows`);

  const [people] = await bq.query({ query: `SELECT instructor_user_id AS u, ANY_VALUE(instructor_role) AS r, COUNT(DISTINCT organisation_assessment_id) AS exams FROM ${T} GROUP BY 1` });
  const split = new Map<string, { people: number; exams: number; roles: Map<string, number> }>();
  for (const r of people as Record<string, unknown>[]) {
    const k = where(normUid(plain(r.u)));
    const x = split.get(k) ?? { people: 0, exams: 0, roles: new Map() };
    x.people++; x.exams += Number(plain(r.exams)) || 0; const role = plain(r.r) || "(blank)"; x.roles.set(role, (x.roles.get(role) ?? 0) + 1);
    split.set(k, x);
  }
  console.log(`\n2. Everyone in the topin table (${(people as unknown[]).length} people):`);
  for (const [k, x] of [...split].sort((a, b) => b[1].people - a[1].people)) console.log(`   ${k}: ${x.people} people, ${x.exams} exams taken | roles: ${[...x.roles].map(([r, n]) => `${r} ${n}`).join(", ")}`);

  const [dsa] = await bq.query({ query: `SELECT assessment_title AS t, ARRAY_AGG(DISTINCT instructor_user_id IGNORE NULLS) AS us FROM ${T}
      WHERE REGEXP_CONTAINS(LOWER(assessment_title), r'(^|[^a-z])dsa([^a-z]|$)|sem ?[23]|semester [23]|3rd sem') GROUP BY 1` });
  console.log("\n3. DSA / semester exams, top 40 by takers: takers | FCC dept | FCC other team | TeachOS list only | NOT in TeachOS list");
  const lines = (dsa as Record<string, unknown>[]).map((r) => {
    const us = ((r.us as unknown[]) ?? []).map((u) => normUid(plain(u)));
    const c = (k: string) => us.filter((u) => where(u) === k).length;
    return { t: plain(r.t), n: us.length, a: c("FCC Instructor department"), b: c("in FCC, other team"), c: c("TeachOS instructor list only"), d: c("NOT in TeachOS instructor list (student / outsider?)") };
  }).sort((a, b) => b.n - a.n).slice(0, 40);
  for (const l of lines) console.log(`   ${l.t} | ${l.n} | ${l.a} | ${l.b} | ${l.c} | ${l.d}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
