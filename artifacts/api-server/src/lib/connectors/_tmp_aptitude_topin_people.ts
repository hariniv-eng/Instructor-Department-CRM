// One-off, READ-ONLY (2026-11-19, per request: "for the Aptitude instructors, do they have any topin assessments recorded under their name
// or employee ID?"). Every Instructor-department person whose subject is Aptitude (Training and Deployed): is a topin exam recorded
// under their TeachOS user id -- and, when the topin table has an e-mail column, under their org e-mail -- how many in total, how many
// Aptitude ones and their average best %, how many counted as other subjects; plus their learning-portal Aptitude assessments.
// Employee IDs only, no names.
//   pnpm exec tsx src/lib/connectors/_tmp_aptitude_topin_people.ts > aptitude_topin.csv; cat aptitude_topin.csv
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { courseOfExam, normUid } from "./topinAssessments";
import { fetchLpSubjectAssessments } from "./trainingReadiness";
import { departmentIdsOf } from "../../routes/reports";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));

async function main() {
  const all = await db.select().from(instructorsTable);
  const dept = departmentIdsOf(all);
  const people = all.filter((p) => dept.has(p.id) && normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) === "Aptitude");
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const table = process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details";
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [cols] = await bq.query({ query: `SELECT column_name FROM \`${P}.${DS}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`, params: { t: table } });
  const mailCol = (cols as Record<string, unknown>[]).map((c) => plain(c.column_name)).find((c) => /mail/i.test(c));
  console.error(`topin columns: ${(cols as Record<string, unknown>[]).map((c) => plain(c.column_name)).join(", ")} | e-mail column: ${mailCol ?? "none"}`);
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, ${mailCol ? `LOWER(TRIM(ANY_VALUE(${mailCol})))` : "''"} AS m, organisation_assessment_id AS a, ANY_VALUE(assessment_title) AS t,
      MAX(assessment_best_user_percentage_score) AS s, MAX(exam_attempt_start_date) AS d FROM \`${P}.${DS}.${table}\` GROUP BY u, a` });
  type X = { total: number; apt: number; aptSum: number; other: Map<string, number>; last: string };
  const byUid = new Map<string, X>(), byMail = new Map<string, X>();
  const add = (map: Map<string, X>, k: string, r: Record<string, unknown>) => {
    if (!k) return;
    const x = map.get(k) ?? { total: 0, apt: 0, aptSum: 0, other: new Map(), last: "" };
    const c = courseOfExam(plain(r.t)); const d = plain(r.d).slice(0, 10);
    x.total++; if (d > x.last) x.last = d;
    if (c?.subject === "Aptitude") { x.apt++; x.aptSum += (Number(plain(r.s)) || 0) * 100; }
    else { const k2 = c?.subject ?? "not counted"; x.other.set(k2, (x.other.get(k2) ?? 0) + 1); }
    map.set(k, x);
  };
  for (const r of rows as Record<string, unknown>[]) { add(byUid, normUid(plain(r.u)), r); add(byMail, plain(r.m), r); }
  const lp = await fetchLpSubjectAssessments(true);
  console.log("employee_id,product,in_teachos,topin_found_by,topin_exams_total,topin_aptitude_exams,topin_aptitude_avg_pct,topin_other_subjects,topin_last_date,lp_aptitude_assessments,lp_aptitude_avg_pct");
  let found = 0, withApt = 0, withLp = 0;
  for (const p of people.sort((a, b) => (a.employeeId ?? "").localeCompare(b.employeeId ?? ""))) {
    const uid = p.teachosUserId ? normUid(p.teachosUserId) : "";
    const mail = (p.orgEmail ?? "").trim().toLowerCase();
    const xu = uid ? byUid.get(uid) : undefined, xm = mailCol && mail ? byMail.get(mail) : undefined;
    const x = xu ?? xm; const by = xu ? "TeachOS id" : xm ? "e-mail" : "none";
    const l = uid ? lp.get(uid)?.["Aptitude"] : undefined;
    if (x) found++; if (x?.apt) withApt++; if (l?.n) withLp++;
    const other = x ? [...x.other].map(([k, v]) => `${k} ${v}`).join("; ") : "";
    console.log([p.employeeId ?? "(no id)", productOf(p), p.inTeachos ? "yes" : "no", by, x?.total ?? 0, x?.apt ?? 0, x?.apt ? Math.round((x.aptSum / x.apt) * 10) / 10 : "", `"${other}"`, x?.last ?? "", l?.n ?? 0, l?.avg ?? ""].join(","));
  }
  console.error(`Aptitude people: ${people.length} | any topin exam: ${found} | an Aptitude topin exam: ${withApt} | learning-portal Aptitude assessments: ${withLp}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
