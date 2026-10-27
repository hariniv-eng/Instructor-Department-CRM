// One-off, READ-ONLY (2026-10-27): audit of "Taught in class" for EVERY instructor the page can show. For each person it works out
// whether they are visible now (stored data), whether they would be after the next sync (live, current code), and -- if not, or if
// some lectures are missing -- why, from their LECTURE sessions in BigQuery:
//   stale (sync needed) | hidden by the tech / non-tech rule | only PARTIALLY_COMPLETED | only at non-NIAT campuses |
//   lectures that match the list by TITLE but whose unit ID is not in the list (fixable: add the ID) | courses not on the list | none.
// Prints a summary and every "title only" unit ID (course, lecture, unit id, portal course, sessions, instructors -- no staff names),
// which is what is needed to add the missing IDs. Writes taught_audit_people.csv (staff names -- delete after download). Changes nothing.
//   pnpm exec tsx src/lib/connectors/_tmp_taught_audit.ts
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import { db, instructorsTable, instructorTaughtCourseTable } from "@workspace/db";
import { config } from "./config";
import { productOf } from "../product";
import { normalizeSubjectArea } from "../departmentTaxonomy";
import { fetchTaughtCourseRows, portalColumnOf } from "./taughtTraining";
import { LECTURE_COURSES } from "../../data/lectureSessions";

// Same population and rules as GET /reports/taught-training (routes/reports.ts).
const EXCLUDED = new Set(["excluded_other_department", "excluded_non_department_team", "excluded_ops_managers", "instructor_ops", "iit_kharagpur_team", "other_department_manual"]);
const NON_TECH = new Set(["English", "Aptitude", "Maths"]);
const plain = (v: unknown): string => (v && typeof v === "object" && "value" in (v as object) ? String((v as { value: unknown }).value) : v == null ? "" : String(v));
const nameKey = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
type Row = { uid: string; portalKey: string | null; subject: string | null; curriculum: number; completed: number };

async function main() {
  const all = await db.select().from(instructorsTable);
  const people = all.filter((r) => r.inTeachos && r.teachosUserId && !EXCLUDED.has(r.classification ?? "") && productOf(r) === "NIAT (Deployed)" && (!r.enrolledPlans || /niat/i.test(r.enrolledPlans)));
  const byUid = new Map(people.map((p) => [p.teachosUserId!, p]));
  const areaOf = (uid: string) => { const p = byUid.get(uid)!; return normalizeSubjectArea(p.deptArea || p.manualDeptArea || null) as string | null; };
  // visible = at least one cell with a completed lecture after the tech / non-tech rule; also how many cells the rule removed
  const visibility = (rows: Row[]) => {
    const vis = new Set<string>(), hiddenByRule = new Set<string>();
    for (const r of rows) {
      if (!byUid.has(r.uid) || r.curriculum <= 0 || !r.portalKey) continue;
      const subject = portalColumnOf(r.portalKey)?.subject ?? r.subject ?? "Other";
      const area = areaOf(r.uid);
      if (area && NON_TECH.has(area) !== NON_TECH.has(subject)) { if (r.completed > 0) hiddenByRule.add(r.uid); continue; }
      if (r.completed > 0) vis.add(r.uid);
    }
    return { vis, hiddenByRule };
  };
  const stored = await db.select().from(instructorTaughtCourseTable);
  const now = visibility(stored.map((t) => ({ uid: t.instructorUserId, portalKey: t.portalCourseKey, subject: t.courseSubject, curriculum: t.curriculumSessions, completed: t.completedSessions })));
  const live = visibility((await fetchTaughtCourseRows()).map((t) => ({ uid: t.instructor_user_id, portalKey: t.portal_course_key, subject: t.course_subject, curriculum: t.curriculum_sessions, completed: t.completed_sessions })));
  console.log(`Population (NIAT deployed, TeachOS): ${people.length}. Stored data synced ${stored[0] ? new Date(stored[0].syncedAt).toISOString() : "never"}.`);
  console.log(`Visible now: ${now.vis.size}  |  visible after next sync: ${live.vis.size}\n`);

  // Lecture list lookups
  const unitToLec = new Map<string, string>();
  const nameToLec = new Map<string, string[]>();
  LECTURE_COURSES.forEach((c) => c.lectures.forEach((l) => {
    const tag = `${c.title} #${l.n} ${l.name}`;
    for (const u of l.unitIds) unitToLec.set(u, tag);
    for (const part of l.name.split(/\s*\(\+\s*/)) { const k = nameKey(part); if (k) nameToLec.set(k, [...(nameToLec.get(k) ?? []), tag]); }
  }));

  const bq = new BigQuery({ projectId: config.BIGQUERY_PROJECT_ID, ...(config.BIGQUERY_CREDENTIALS_JSON ? { credentials: JSON.parse(config.BIGQUERY_CREDENTIALS_JSON) } : {}) });
  const [rows] = await bq.query({ query: `
    SELECT instructor_user_id AS uid, session_id AS sid, ANY_VALUE(institute_type) AS itype, STRING_AGG(DISTINCT CAST(session_status AS STRING), '/') AS status,
           ANY_VALUE(session_title) AS title, ANY_VALUE(learning_portal_course_title) AS course,
           STRING_AGG(DISTINCT CONCAT(REPLACE(LOWER(IFNULL(resource_id, '')), '-', ''), '^^', IFNULL(resource_title, '')), '~~') AS res
    FROM \`${config.BIGQUERY_PROJECT_ID}.${config.BIGQUERY_DATASET}.niat_scheduled_session_wise_resource_details\`
    WHERE instructor_user_id IN UNNEST(@uids) AND UPPER(session_type) = 'LECTURE' AND session_start_datetime <= CURRENT_DATETIME()
    GROUP BY 1, 2`, params: { uids: people.map((p) => p.teachosUserId!) } });

  type P = { lectures: number; listedOk: number; listedPartial: number; listedNonNiat: number; titleOnly: number; other: number; otherCourses: Set<string> };
  const per = new Map<string, P>();
  const cand = new Map<string, { lecture: string; unit: string; course: string; sessions: number; people: Set<string> }>();
  for (const r of rows as Record<string, unknown>[]) {
    const uid = plain(r.uid);
    const p = per.get(uid) ?? { lectures: 0, listedOk: 0, listedPartial: 0, listedNonNiat: 0, titleOnly: 0, other: 0, otherCourses: new Set<string>() };
    p.lectures++;
    const res = plain(r.res).split("~~").map((x) => { const [id = "", rt = ""] = x.split("^^"); return { id, rt }; });
    const status = plain(r.status), niat = plain(r.itype) === "NIAT_OFFLINE", completed = status.split("/").includes("COMPLETED");
    if (res.some((x) => unitToLec.has(x.id))) {
      if (!niat) p.listedNonNiat++; else if (!completed) p.listedPartial++; else p.listedOk++;
    } else {
      // title-only: a resource (or the session) titled exactly like a lecture of the list
      const hit = res.map((x) => ({ x, tags: nameToLec.get(nameKey(x.rt)) })).find((h) => h.tags && h.x.id)
        ?? (nameToLec.get(nameKey(plain(r.title))) ? { x: { id: "(no unit with that title)", rt: plain(r.title) }, tags: nameToLec.get(nameKey(plain(r.title))) } : undefined);
      if (hit && niat) {
        p.titleOnly++;
        const k = `${hit.tags!.join(" OR ")}|${hit.x.id}|${plain(r.course)}`;
        const c = cand.get(k) ?? { lecture: hit.tags!.join(" OR "), unit: hit.x.id, course: plain(r.course), sessions: 0, people: new Set<string>() };
        c.sessions++; c.people.add(uid); cand.set(k, c);
      } else { p.other++; if (plain(r.course)) p.otherCourses.add(plain(r.course)); }
    }
    per.set(uid, p);
  }

  const reasons = new Map<string, number>();
  const out = [["Employee ID", "Name", "Subject", "Status", "Lecture sessions", "Counted", "Partial only", "Non-NIAT campus", "Title only (ID missing)", "Not on list", "Courses not on list"].join(",")];
  const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  let visibleButMissing = 0;
  for (const person of people) {
    const uid = person.teachosUserId!;
    const p = per.get(uid);
    const status = now.vis.has(uid) ? (live.vis.has(uid) ? "VISIBLE" : "VISIBLE now, but NOT after next sync")
      : live.vis.has(uid) ? "HIDDEN now -> visible after Sync Now"
      : live.hiddenByRule.has(uid) ? "HIDDEN by tech / non-tech rule (subject vs course)"
      : !p ? "No lecture sessions"
      : p.listedPartial > 0 && !p.listedOk ? "HIDDEN: listed lectures only PARTIALLY_COMPLETED"
      : p.listedNonNiat > 0 && !p.listedOk ? "HIDDEN: listed lectures only at non-NIAT campuses"
      : p.titleOnly > 0 ? "HIDDEN: lectures match by title, unit ID missing from list (fixable)"
      : "HIDDEN: lectures only in courses not on the list";
    if (status === "VISIBLE" && p && p.titleOnly > 0) visibleButMissing++;
    reasons.set(status, (reasons.get(status) ?? 0) + 1);
    out.push([person.employeeId, person.fullName, person.deptArea || person.manualDeptArea, status, p?.lectures ?? 0, p?.listedOk ?? 0, p?.listedPartial ?? 0, p?.listedNonNiat ?? 0, p?.titleOnly ?? 0, p?.other ?? 0, [...(p?.otherCourses ?? [])].join(" | ")].map(esc).join(","));
  }
  console.log("Instructors by status:");
  for (const [k, v] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  console.log(`  (${visibleButMissing} visible instructors also have lectures that match only by title -- they are under-counted)\n`);

  const notListed = new Map<string, number>();
  for (const p of per.values()) for (const c of p.otherCourses) notListed.set(c, (notListed.get(c) ?? 0) + 1);
  console.log("Portal courses of lectures NOT on the list (instructors):");
  for (const [k, v] of [...notListed].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(v).padStart(4)}  ${k}`);

  console.log(`\nTITLE-ONLY matches -> unit IDs to add (lecture | unit id | portal course | sessions | instructors):`);
  for (const c of [...cand.values()].sort((a, b) => a.lecture.localeCompare(b.lecture) || b.sessions - a.sessions)) console.log(`  ${c.lecture} | ${c.unit} | ${c.course} | ${c.sessions} | ${c.people.size}`);

  fs.writeFileSync("taught_audit_people.csv", out.join("\n"));
  console.log(`\nPer instructor: taught_audit_people.csv (has staff names -- delete after download).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
