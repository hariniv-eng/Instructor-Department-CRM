// One-off, READ-ONLY (2026-11-21, per request: "for each instructor, get the data of all the topin exams they have written").
// Everyone in the FCC Instructor department with a TeachOS id (all products): one row per instructor x topin exam -- title, Daily/Weekly,
// best score %, first and last attempt date, and what FCC counts the exam as today (course + subject; Aptitude instructors: all their
// non-technical exams count as Aptitude). People with no topin exam get one row with the exam columns empty.
// Writes topin_per_instructor.csv (HAS NAMES): download it from the Replit Files panel, then delete it: rm topin_per_instructor.csv
//   pnpm exec tsx src/lib/connectors/_tmp_topin_per_instructor.ts
import fs from "node:fs";
import { BigQuery } from "@google-cloud/bigquery";
import { db, instructorsTable } from "@workspace/db";
import { config } from "./config";
import { courseOfExam, normUid } from "./topinAssessments";
import { departmentIdsOf } from "../../routes/reports";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { productOf } from "../product";

const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const csv = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  const all = await db.select().from(instructorsTable);
  const dept = departmentIdsOf(all);
  const people = all.filter((p) => p.teachosUserId && dept.has(p.id));
  const P = config.BIGQUERY_PROJECT_ID!, DS = config.BIGQUERY_DATASET!;
  const T = `\`${P}.${DS}.${process.env.TOPIN_ASSESSMENT_TABLE || "z_niat_tech_instrctor_trainee_exam_best_scores_details"}\``;
  const bq = new BigQuery({ projectId: P, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `SELECT instructor_user_id AS u, organisation_assessment_id AS a, ANY_VALUE(assessment_title) AS t, ANY_VALUE(exam_type) AS ty,
      MAX(assessment_best_user_percentage_score) AS s, MIN(exam_attempt_start_date) AS d1, MAX(exam_attempt_start_date) AS d2 FROM ${T} GROUP BY u, a` });
  const byUid = new Map<string, Record<string, unknown>[]>();
  for (const r of rows as Record<string, unknown>[]) { const u = normUid(plain(r.u)); byUid.set(u, [...(byUid.get(u) ?? []), r]); }
  const out = [["employee_id", "name", "product", "subject", "capability_manager", "exam_title", "daily_weekly", "best_score_pct", "first_attempt", "last_attempt", "fcc_course", "fcc_subject"].join(",")];
  let withExams = 0, examRows = 0;
  for (const p of people.sort((a, b) => a.fullName.localeCompare(b.fullName))) {
    const subject = normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) ?? "";
    const base = [p.employeeId ?? "", p.fullName, productOf(p), subject, p.teachosManager || p.manualCapabilityManager || ""];
    const exams = (byUid.get(normUid(p.teachosUserId!)) ?? []).sort((a, b) => plain(a.d1).localeCompare(plain(b.d1)));
    if (!exams.length) { out.push([...base, "", "", "", "", "", "", ""].map(csv).join(",")); continue; }
    withExams++;
    for (const e of exams) {
      const c = courseOfExam(plain(e.t));
      const fccSubject = subject === "Aptitude" && (!c || c.subject === "Aptitude" || c.subject === "Maths") ? "Aptitude" : c?.subject ?? "(not counted)";
      const fccCourse = subject === "Aptitude" && fccSubject === "Aptitude" ? "Aptitude exams" : c?.title ?? "(not counted)";
      const s = Number(plain(e.s));
      out.push([...base, plain(e.t).trim(), plain(e.ty), Number.isFinite(s) ? Math.round(s * 1000) / 10 : "", plain(e.d1).slice(0, 10), plain(e.d2).slice(0, 10), fccCourse, fccSubject].map(csv).join(","));
      examRows++;
    }
  }
  fs.writeFileSync("topin_per_instructor.csv", out.join("\n"));
  console.log(`Instructor department people with a TeachOS id: ${people.length} | with at least one topin exam: ${withExams} | exam rows: ${examRows}`);
  console.log("Wrote topin_per_instructor.csv (has names). Download it from the Files panel, then: rm topin_per_instructor.csv");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
